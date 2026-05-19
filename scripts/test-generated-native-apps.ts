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

const MACOS_LAUNCH_SMOKE_SECONDS = 10;

interface Command {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}

interface SmokeContext {
  readonly cwd: string;
  readonly projectPath: string;
  readonly platform: SmokePlatform;
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
    env: command.env ?? process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${display} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function commandOutput(command: Command): string | undefined {
  const result = spawnSync(command.command, command.args as string[], {
    cwd: command.cwd,
    encoding: "utf-8",
    env: command.env ?? process.env,
  });

  if (result.error || result.status !== 0) return undefined;
  return result.stdout;
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
      args: ["assembleRelease", "-PnativiteSmokeDisableReleaseLint=true", "--no-daemon"],
      cwd: projectPath,
    },
  ];
}

function runMacOSLaunchSmoke(cwd: string, appPath: string): void {
  const script = `
set -euo pipefail
open --wait-apps --new "$NATIVITE_MACOS_SMOKE_APP_PATH" &
open_pid=$!
sleep "$NATIVITE_MACOS_SMOKE_SECONDS"
if kill -0 "$open_pid" 2>/dev/null; then
  osascript -e 'tell application id "dev.nativite.smoke" to quit' >/dev/null 2>&1 || true
  sleep 1
  kill "$open_pid" >/dev/null 2>&1 || true
  wait "$open_pid" >/dev/null 2>&1 || true
  exit 0
fi
if wait "$open_pid"; then
  status=1
else
  status=$?
fi
echo "Generated macOS app exited during the launch smoke window."
exit "$status"
`;

  run({
    command: "bash",
    args: ["-lc", script],
    cwd,
    env: {
      ...process.env,
      NATIVITE_MACOS_SMOKE_APP_PATH: appPath,
      NATIVITE_MACOS_SMOKE_SECONDS: String(MACOS_LAUNCH_SMOKE_SECONDS),
    },
  });
}

function launchSmoke(context: SmokeContext): void {
  if (process.env["NATIVITE_GENERATED_SMOKE_LAUNCH"] !== "1") {
    console.log("Skipping launch smoke; set NATIVITE_GENERATED_SMOKE_LAUNCH=1 to enable it.");
    return;
  }

  if (context.platform === "macos") {
    const appPath = join(
      context.cwd,
      ".nativite",
      "macos",
      "DerivedData",
      "Build",
      "Products",
      "Debug",
      "SmokeApp.app",
    );
    runMacOSLaunchSmoke(context.cwd, appPath);
    return;
  }

  if (context.platform === "ios") {
    const bootedDevices = commandOutput({
      command: "xcrun",
      args: ["simctl", "list", "devices", "booted"],
      cwd: context.cwd,
    });
    const bootedDevice = bootedDevices?.match(/\(([0-9A-F-]{36})\) \(Booted\)/)?.[1];
    if (!bootedDevice) {
      console.log("Skipping iOS launch smoke; no booted simulator is available.");
      return;
    }

    const appPath = join(
      context.cwd,
      ".nativite",
      "ios",
      "DerivedData",
      "Build",
      "Products",
      "Debug-iphonesimulator",
      "SmokeApp.app",
    );
    run({ command: "xcrun", args: ["simctl", "install", bootedDevice, appPath], cwd: context.cwd });
    run({
      command: "xcrun",
      args: ["simctl", "launch", bootedDevice, "dev.nativite.smoke"],
      cwd: context.cwd,
    });
    return;
  }

  const devices = commandOutput({
    command: "adb",
    args: ["devices"],
    cwd: context.projectPath,
  });
  const hasDevice = devices
    ?.split("\n")
    .slice(1)
    .some((line) => line.endsWith("\tdevice"));
  if (!hasDevice) {
    console.log("Skipping Android launch smoke; no emulator or device is available.");
    return;
  }

  run({
    command: join(context.projectPath, "gradlew"),
    args: ["installDebug", "--no-daemon"],
    cwd: context.projectPath,
  });
  run({
    command: "adb",
    args: [
      "shell",
      "monkey",
      "-p",
      "dev.nativite.smoke",
      "-c",
      "android.intent.category.LAUNCHER",
      "1",
    ],
    cwd: context.projectPath,
  });
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
      launchSmoke({ cwd, projectPath, platform });
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
