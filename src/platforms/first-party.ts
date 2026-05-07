import type { NativitePlatformPlugin } from "../index.ts";
import type { AppleTargetPlatform } from "../native/ios/index.ts";

import { definePlatformPlugin } from "../index.ts";
import { generateProject as generateAndroidProject } from "../native/android/index.ts";
import { generateProject } from "../native/ios/index.ts";

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

const iosPlatformPlugin = definePlatformPlugin({
  name: "nativite-ios",
  platform: "ios",
  native: true,
  mobile: true,
  desktop: false,
  environments: ["ios", "ipad"],
  extensions: [".ios", ".mobile", ".native"],
  async generate(ctx) {
    await generateAppleProject("ios", ctx);
  },
  async build(ctx) {
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "build", "ios");
  },
});

const macosPlatformPlugin = definePlatformPlugin({
  name: "nativite-macos",
  platform: "macos",
  native: true,
  mobile: false,
  desktop: true,
  environments: ["macos"],
  extensions: [".macos", ".desktop", ".native"],
  async generate(ctx) {
    await generateAppleProject("macos", ctx);
  },
  async build(ctx) {
    await generateProject(ctx.rootConfig, ctx.projectRoot, false, "build", "macos");
  },
});

const androidPlatformPlugin = definePlatformPlugin({
  name: "nativite-android",
  platform: "android",
  native: true,
  mobile: true,
  desktop: false,
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
  async build(ctx) {
    await generateAndroidProject(ctx.rootConfig, ctx.projectRoot, false, "build");
  },
});

export const FIRST_PARTY_PLATFORM_PLUGINS: ReadonlyArray<NativitePlatformPlugin> = [
  iosPlatformPlugin,
  macosPlatformPlugin,
  androidPlatformPlugin,
];
