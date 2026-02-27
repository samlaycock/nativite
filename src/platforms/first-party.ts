import { execSync, spawn } from "node:child_process";
import { join } from "node:path";

import type { NativiteConfig, NativitePlatformPlugin } from "../index.ts";

import { generateProject } from "../ios/index.ts";

function formatExecSyncError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const execErr = err as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
  const stdout = execErr.stdout ? String(execErr.stdout).trim() : "";
  const stderr = execErr.stderr ? String(execErr.stderr).trim() : "";
  const details = [stderr, stdout].filter(Boolean).join("\n");

  return details ? `${err.message}\n${details}` : err.message;
}

async function buildAndLaunchSimulator(
  config: NativiteConfig,
  projectRoot: string,
  simulatorName: string,
  devUrl: string,
  appIdOverride?: string,
): Promise<void> {
  const appName = config.app.name;
  const appId = appIdOverride ?? config.app.bundleId;
  const projectPath = join(projectRoot, ".nativite", "ios", `${appName}.xcodeproj`);
  const buildDir = `/tmp/nativite-build-${appId}`;
  const derivedDataPath = `/tmp/nativite-derived-${appId}`;

  execSync(`xcrun simctl boot "${simulatorName}" 2>/dev/null || true`, {
    stdio: "pipe",
  });

  execSync(
    [
      "xcodebuild",
      `-project "${projectPath}"`,
      `-scheme "${appName}"`,
      "-configuration Debug",
      `-destination "platform=iOS Simulator,name=${simulatorName}"`,
      `-derivedDataPath "${derivedDataPath}"`,
      `CONFIGURATION_BUILD_DIR="${buildDir}"`,
      "build",
    ].join(" "),
    { stdio: "pipe", cwd: projectRoot },
  );

  const appPath = `${buildDir}/${appName}.app`;
  execSync(`xcrun simctl install "${simulatorName}" "${appPath}"`, {
    stdio: "pipe",
  });

  execSync(
    `SIMCTL_CHILD_NATIVITE_DEV_URL="${devUrl}" xcrun simctl launch "${simulatorName}" "${appId}"`,
    { stdio: "pipe" },
  );
}

async function buildAndLaunchMacOS(
  config: NativiteConfig,
  projectRoot: string,
  devUrl: string,
  appIdOverride?: string,
): Promise<void> {
  const appName = config.app.name;
  const appId = appIdOverride ?? config.app.bundleId;
  const projectPath = join(projectRoot, ".nativite", "ios", `${appName}.xcodeproj`);
  const buildDir = `/tmp/nativite-build-${appId}-macos`;
  const derivedDataPath = `/tmp/nativite-derived-${appId}-macos`;

  execSync(
    [
      "xcodebuild",
      `-project "${projectPath}"`,
      `-scheme "${appName}-macOS"`,
      "-configuration Debug",
      '-destination "platform=macOS"',
      `-derivedDataPath "${derivedDataPath}"`,
      `CONFIGURATION_BUILD_DIR="${buildDir}"`,
      "build",
    ].join(" "),
    { stdio: "pipe", cwd: projectRoot },
  );

  const appPath = `${buildDir}/${appName}.app/Contents/MacOS/${appName}`;
  const child = spawn(appPath, [], {
    env: { ...process.env, NATIVITE_DEV_URL: devUrl },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function generateAppleProject(
  pluginName: string,
  ctx: Parameters<NonNullable<NativitePlatformPlugin["generate"]>>[0],
): Promise<void> {
  const result = await generateProject(
    ctx.rootConfig,
    ctx.projectRoot,
    ctx.force,
    ctx.mode ?? "generate",
  );
  if (result.skipped) {
    ctx.logger.info(`[nativite:${pluginName}] Project is up to date. Use --force to regenerate.`);
  } else {
    ctx.logger.info(`[nativite:${pluginName}] Generated: ${result.projectPath}`);
  }
}

const iosPlatformPlugin: NativitePlatformPlugin = {
  name: "nativite-ios",
  platform: "ios",
  environments: ["ios", "ipad"],
  extensions: [".ios", ".mobile", ".native"],
  async generate(ctx) {
    await generateAppleProject("ios", ctx);
  },
  async dev(ctx) {
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "dev");

    if (process.platform !== "darwin") {
      ctx.logger.warn("[nativite:ios] Skipping iOS launch; this host is not macOS.");
      return;
    }

    if (ctx.launchTarget === "device") {
      ctx.logger.info(
        "[nativite:ios] Device target; open the Xcode project and run on your device. " +
          `The app will load ${ctx.devUrl}`,
      );
      return;
    }

    try {
      ctx.logger.info(`[nativite:ios] Booting simulator: ${ctx.simulatorName}`);
      ctx.logger.info("[nativite:ios] Building with xcodebuild (this may take a moment)...");
      await buildAndLaunchSimulator(
        ctx.rootConfig,
        ctx.projectRoot,
        ctx.simulatorName,
        ctx.devUrl,
        ctx.config.app.bundleId,
      );
      ctx.logger.info(`[nativite:ios] App launched. WebView loading ${ctx.devUrl}`);
    } catch (err) {
      ctx.logger.error(`[nativite:ios] Build/launch failed:\n${formatExecSyncError(err)}`);
    }
  },
  async build(ctx) {
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "build");
  },
};

const macosPlatformPlugin: NativitePlatformPlugin = {
  name: "nativite-macos",
  platform: "macos",
  environments: ["macos"],
  extensions: [".macos", ".desktop", ".native"],
  async generate(ctx) {
    await generateAppleProject("macos", ctx);
  },
  async dev(ctx) {
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "dev");

    if (process.platform !== "darwin") {
      ctx.logger.warn("[nativite:macos] Skipping macOS launch; this host is not macOS.");
      return;
    }

    try {
      ctx.logger.info("[nativite:macos] Building macOS target with xcodebuild...");
      await buildAndLaunchMacOS(
        ctx.rootConfig,
        ctx.projectRoot,
        ctx.devUrl,
        ctx.config.app.bundleId,
      );
      ctx.logger.info(`[nativite:macos] macOS app launched. WebView loading ${ctx.devUrl}`);
    } catch (err) {
      ctx.logger.error(`[nativite:macos] Build/launch failed:\n${formatExecSyncError(err)}`);
    }
  },
  async build(ctx) {
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "build");
  },
};

export const FIRST_PARTY_PLATFORM_PLUGINS: ReadonlyArray<NativitePlatformPlugin> = [
  iosPlatformPlugin,
  macosPlatformPlugin,
];
