import { execSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig, NativitePlatformLogger, NativitePlatformPlugin } from "../index.ts";
import type { AppleTargetPlatform } from "../ios/index.ts";

import { generateProject as generateAndroidProject } from "../android/index.ts";
import { runGradle } from "../cli/gradle.ts";
import { runXcodebuild } from "../cli/xcodebuild.ts";
import { generateProject } from "../ios/index.ts";

async function buildAndLaunchSimulator(
  config: NativiteConfig,
  projectRoot: string,
  simulatorName: string,
  devUrl: string,
  logger: NativitePlatformLogger,
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

  await runXcodebuild({
    args: [
      "-project",
      projectPath,
      "-scheme",
      appName,
      "-configuration",
      "Debug",
      "-destination",
      `platform=iOS Simulator,name=${simulatorName}`,
      "-derivedDataPath",
      derivedDataPath,
      `CONFIGURATION_BUILD_DIR=${buildDir}`,
      "build",
    ],
    cwd: projectRoot,
    logger,
  });

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
  logger: NativitePlatformLogger,
  appIdOverride?: string,
): Promise<void> {
  const appName = config.app.name;
  const appId = appIdOverride ?? config.app.bundleId;
  const projectPath = join(projectRoot, ".nativite", "macos", `${appName}.xcodeproj`);
  const buildDir = `/tmp/nativite-build-${appId}-macos`;
  const derivedDataPath = `/tmp/nativite-derived-${appId}-macos`;

  await runXcodebuild({
    args: [
      "-project",
      projectPath,
      "-scheme",
      appName,
      "-configuration",
      "Debug",
      "-destination",
      "platform=macOS",
      "-derivedDataPath",
      derivedDataPath,
      `CONFIGURATION_BUILD_DIR=${buildDir}`,
      "build",
    ],
    cwd: projectRoot,
    logger,
  });

  // Kill any existing instance before launching a fresh one.
  const appBundle = `${buildDir}/${appName}.app`;
  execSync(`pkill -f "${appBundle}/Contents/MacOS/" 2>/dev/null || true`, { stdio: "pipe" });

  // Launch the binary directly with NATIVITE_DEV_URL in the environment.
  // The explicit main.swift entry point calls NSApp.setActivationPolicy(.regular)
  // so the process gets a Dock icon and proper GUI behavior without needing `open`.
  const child = spawn(`${appBundle}/Contents/MacOS/${appName}`, [], {
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, NATIVITE_DEV_URL: devUrl },
  });
  child.on("error", (err) => logger.error(`Failed to launch: ${err.message}`));
  child.unref();
}

async function generateAppleProject(
  targetPlatform: AppleTargetPlatform,
  ctx: Parameters<NonNullable<NativitePlatformPlugin["generate"]>>[0],
): Promise<void> {
  const result = await generateProject(
    ctx.rootConfig,
    ctx.projectRoot,
    ctx.force,
    ctx.mode ?? "generate",
    targetPlatform,
  );
  if (result.skipped) {
    ctx.logger.info(`Project is up to date. Use --force to regenerate.`);
  } else {
    ctx.logger.info(`Generated: ${result.projectPath}`);
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
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "dev", "ios");

    if (process.platform !== "darwin") {
      ctx.logger.warn("Skipping iOS launch; this host is not macOS.");
      return;
    }

    if (ctx.launchTarget === "device") {
      ctx.logger.info(
        "Device target; open the Xcode project and run on your device. " +
          `The app will load ${ctx.devUrl}`,
      );
      return;
    }

    try {
      const simulatorName = ctx.simulatorName ?? "iPhone 16 Pro";
      ctx.logger.info(`Booting simulator: ${simulatorName}`);
      await buildAndLaunchSimulator(
        ctx.rootConfig,
        ctx.projectRoot,
        simulatorName,
        ctx.devUrl,
        ctx.logger,
        ctx.config.app.bundleId,
      );
      ctx.logger.info(`App launched. WebView loading ${ctx.devUrl}`);
    } catch (err) {
      ctx.logger.error(`Build/launch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  async build(ctx) {
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "build", "ios");
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
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "dev", "macos");

    if (process.platform !== "darwin") {
      ctx.logger.warn("Skipping macOS launch; this host is not macOS.");
      return;
    }

    try {
      ctx.logger.info("Building macOS target...");
      await buildAndLaunchMacOS(
        ctx.rootConfig,
        ctx.projectRoot,
        ctx.devUrl,
        ctx.logger,
        ctx.config.app.bundleId,
      );
      ctx.logger.info(`macOS app launched. WebView loading ${ctx.devUrl}`);
    } catch (err) {
      ctx.logger.error(`Build/launch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  async build(ctx) {
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "build", "macos");
  },
};

const androidPlatformPlugin: NativitePlatformPlugin = {
  name: "nativite-android",
  platform: "android",
  environments: ["android"],
  extensions: [".android", ".mobile", ".native"],
  async generate(ctx) {
    const result = await generateAndroidProject(
      ctx.rootConfig,
      ctx.projectRoot,
      ctx.force,
      ctx.mode ?? "generate",
    );
    if (result.skipped) {
      ctx.logger.info("Project is up to date. Use --force to regenerate.");
    } else {
      ctx.logger.info(`Generated: ${result.projectPath}`);
    }
  },
  async dev(ctx) {
    await generateAndroidProject(ctx.rootConfig, ctx.projectRoot, false, "dev");

    const projectPath = join(ctx.projectRoot, ".nativite", "android");
    const assetsDir = join(projectPath, "app", "src", "main", "assets");
    writeFileSync(join(assetsDir, "dev.json"), JSON.stringify({ devURL: ctx.devUrl }));

    try {
      ctx.logger.info("Building Android debug APK...");
      await runGradle({
        args: ["assembleDebug"],
        cwd: projectPath,
        logger: ctx.logger,
      });

      const appId = ctx.config.app.bundleId;
      const apkPath = join(projectPath, "app", "build", "outputs", "apk", "debug", "app-debug.apk");

      execSync(`adb install -r "${apkPath}"`, { stdio: "pipe" });
      execSync(`adb shell am start -n "${appId}/.MainActivity"`, { stdio: "pipe" });

      ctx.logger.info(`App launched. WebView loading ${ctx.devUrl}`);
    } catch (err) {
      ctx.logger.error(`Build/launch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  async build(ctx) {
    await generateAndroidProject(ctx.rootConfig, ctx.projectRoot, false, "build");
  },
};

export const FIRST_PARTY_PLATFORM_PLUGINS: ReadonlyArray<NativitePlatformPlugin> = [
  iosPlatformPlugin,
  macosPlatformPlugin,
  androidPlatformPlugin,
];
