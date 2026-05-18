import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { android, ios, macos, type NativiteConfig } from "../src/index.ts";
import { generateProject as generateAndroidProject } from "../src/native/android/generator.ts";
import { generateProject as generateAppleProject } from "../src/native/ios/generator.ts";
import { appIntegrity } from "../src/plugins/app-integrity/index.ts";
import { calendar } from "../src/plugins/calendar/index.ts";
import { captureProtection } from "../src/plugins/capture-protection/index.ts";
import { contacts } from "../src/plugins/contacts/index.ts";
import { haptics } from "../src/plugins/haptics/index.ts";
import { localAuth } from "../src/plugins/local-auth/index.ts";
import { notifications } from "../src/plugins/notifications/index.ts";
import { secureStore } from "../src/plugins/secure-store/index.ts";
import { systemControls } from "../src/plugins/system-controls/index.ts";

type SmokePlatform = "ios" | "macos" | "android";

interface Command {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

const ALL_PLUGINS = [
  appIntegrity,
  calendar,
  captureProtection,
  contacts,
  haptics,
  localAuth(),
  notifications,
  secureStore,
  systemControls,
];

function parsePlatforms(): readonly SmokePlatform[] {
  const arg = process.argv.find((entry) => entry.startsWith("--platform="));
  const value = arg?.slice("--platform=".length) ?? "ios,macos,android";
  const platforms = value.split(",").filter((entry): entry is SmokePlatform => {
    return entry === "ios" || entry === "macos" || entry === "android";
  });

  if (platforms.length === 0) {
    throw new Error(`Expected --platform to include ios, macos, or android. Received: ${value}`);
  }

  return platforms;
}

function run(command: Command): void {
  const display = [command.command, ...command.args].join(" ");
  console.log(`$ ${display}`);

  const result = spawnSync(command.command, command.args as string[], {
    cwd: command.cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${display} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function writeWebBundle(cwd: string, platform: SmokePlatform): void {
  const distDir = join(cwd, `dist-${platform}`);
  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    join(distDir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><title>Nativite Smoke</title></head><body><main>generated ${platform} smoke</main></body></html>`,
  );
}

function writeNativeAssets(cwd: string): void {
  writeFileSync(
    join(cwd, "icon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="224" fill="#101820"/><circle cx="512" cy="512" r="240" fill="#f2aa4c"/></svg>',
  );
}

function makeConfig(platform: SmokePlatform): NativiteConfig {
  return {
    app: {
      name: "SmokeApp",
      bundleId: "dev.nativite.smoke",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [platform === "ios" ? ios() : platform === "macos" ? macos() : android()],
    plugins: ALL_PLUGINS,
    icon: "icon.svg",
    splash: {
      backgroundColor: "#101820",
    },
  };
}

async function generate(cwd: string, platform: SmokePlatform): Promise<string> {
  const config = makeConfig(platform);

  if (platform === "android") {
    return (await generateAndroidProject(config, cwd, true, "build")).projectPath;
  }

  return (await generateAppleProject(config, cwd, true, "build", platform)).projectPath;
}

function appleBuildCommands(cwd: string, platform: "ios" | "macos"): readonly Command[] {
  const project = join(cwd, ".nativite", platform, "SmokeApp.xcodeproj");
  const derivedDataPath = join(cwd, ".nativite", platform, "DerivedData");
  const destination =
    platform === "ios" ? "generic/platform=iOS Simulator" : "generic/platform=macOS";
  const baseArgs = [
    "-project",
    project,
    "-scheme",
    "SmokeApp",
    "-derivedDataPath",
    derivedDataPath,
    "-destination",
    destination,
    "CODE_SIGNING_ALLOWED=NO",
  ];

  return [
    {
      command: "xcodebuild",
      args: [...baseArgs, "-configuration", "Debug", "build"],
      cwd,
    },
    {
      command: "xcodebuild",
      args: [...baseArgs, "-configuration", "Release", "build-for-testing"],
      cwd,
    },
  ];
}

function androidBuildCommands(projectPath: string): readonly Command[] {
  const gradlew = join(projectPath, "gradlew");

  if (!existsSync(gradlew)) {
    throw new Error(`Missing generated Gradle wrapper at ${gradlew}.`);
  }

  return [
    {
      command: gradlew,
      args: ["assembleDebug", "--no-daemon"],
      cwd: projectPath,
    },
    {
      command: gradlew,
      args: ["assembleRelease", "--no-daemon"],
      cwd: projectPath,
    },
  ];
}

async function main(): Promise<void> {
  const platforms = parsePlatforms();
  const keepFixture = process.env["NATIVITE_KEEP_GENERATED_SMOKE_FIXTURE"] === "1";
  const cwd = mkdtempSync(join(tmpdir(), "nativite-generated-app-smoke-"));

  try {
    for (const platform of platforms) {
      console.log(`\nGenerating ${platform} smoke fixture in ${cwd}`);
      writeWebBundle(cwd, platform);
      writeNativeAssets(cwd);
      const projectPath = await generate(cwd, platform);
      const commands =
        platform === "android"
          ? androidBuildCommands(projectPath)
          : appleBuildCommands(cwd, platform);

      for (const command of commands) run(command);
    }
  } finally {
    if (keepFixture) {
      console.log(`Keeping generated smoke fixture at ${cwd}`);
    } else {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
}

await main();
