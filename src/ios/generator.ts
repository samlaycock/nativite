import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import type { NativiteConfig } from "../index.ts";
import type { NativitePluginMode } from "../index.ts";

import { resolveConfigForPlatform } from "../platforms/registry.ts";
import { resolveNativitePlugins } from "../plugins/resolve.ts";
import { hashConfigForGeneration } from "./hash.ts";
import { appDelegateTemplate } from "./templates/app-delegate.ts";
import { appIconContentsTemplate } from "./templates/app-icon-contents.ts";
import { infoPlistMacOSTemplate, infoPlistTemplate } from "./templates/info-plist.ts";
import { launchScreenTemplate } from "./templates/launch-screen.ts";
import { nativiteBridgeTemplate } from "./templates/nativite-bridge.ts";
import { nativiteChromeTemplate } from "./templates/nativite-chrome.ts";
import { nativiteKeyboardTemplate } from "./templates/nativite-keyboard.ts";
import { nativitePluginRegistrantTemplate } from "./templates/nativite-plugin-registrant.ts";
import { nativiteVarsTemplate } from "./templates/nativite-vars.ts";
import { otaUpdaterTemplate } from "./templates/ota-updater.ts";
import { pbxprojTemplate } from "./templates/pbxproj.ts";
import { splashImageContentsTemplate } from "./templates/splash-image-contents.ts";
import { viewControllerTemplate } from "./templates/view-controller.ts";

export type GenerateResult = {
  skipped: boolean;
  projectPath: string;
  hash: string;
};

function hasConfiguredPlatform(config: NativiteConfig, platformId: string): boolean {
  return (config.platforms ?? []).some((platform) => platform.platform === platformId);
}

function requiresLegacyProjectRefresh(config: NativiteConfig, projectRoot: string): boolean {
  const projectPath = join(projectRoot, `${config.app.name}.xcodeproj`, "project.pbxproj");
  if (!existsSync(projectPath)) return true;

  try {
    const pbxproj = readFileSync(projectPath, "utf-8");
    if (!pbxproj.includes('SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";')) return true;
    if (!pbxproj.includes("SDKROOT = iphoneos;")) return true;
    if (!pbxproj.includes("$SRCROOT/../../../dist-ios")) return true;
    if (
      hasConfiguredPlatform(config, "macos") &&
      !pbxproj.includes("$SRCROOT/../../../dist-macos")
    ) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

export async function generateProject(
  config: NativiteConfig,
  cwd: string,
  force = false,
  mode: NativitePluginMode = "generate",
): Promise<GenerateResult> {
  const nativiteDir = join(cwd, ".nativite");
  const hashFile = join(nativiteDir, ".hash");
  const projectRoot = join(nativiteDir, "ios");
  const appName = config.app.name;
  const iosConfig = resolveConfigForPlatform(config, "ios");
  const macosConfig = resolveConfigForPlatform(config, "macos");
  const resolvedPlugins = await resolveNativitePlugins(config, cwd, mode);
  const hash = hashConfigForGeneration(config, resolvedPlugins);

  // Dirty check — skip if nothing has changed
  if (!force && existsSync(hashFile)) {
    const existingHash = readFileSync(hashFile, "utf-8").trim();
    if (existingHash === hash && !requiresLegacyProjectRefresh(config, projectRoot)) {
      return {
        skipped: true,
        projectPath: join(projectRoot, `${appName}.xcodeproj`),
        hash,
      };
    }
  }

  const xcodeproj = join(projectRoot, `${appName}.xcodeproj`);
  const appDir = join(projectRoot, appName);
  const assetsDir = join(appDir, "Assets.xcassets");
  const appIconDir = join(assetsDir, "AppIcon.appiconset");

  for (const dir of [nativiteDir, projectRoot, xcodeproj, appDir, assetsDir, appIconDir]) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(join(appDir, "AppDelegate.swift"), appDelegateTemplate(config));
  writeFileSync(join(appDir, "ViewController.swift"), viewControllerTemplate(config));
  writeFileSync(join(appDir, "NativiteBridge.swift"), nativiteBridgeTemplate(config));
  writeFileSync(
    join(appDir, "NativitePluginRegistrant.swift"),
    nativitePluginRegistrantTemplate(resolvedPlugins),
  );
  writeFileSync(join(appDir, "NativiteChrome.swift"), nativiteChromeTemplate(config));
  writeFileSync(join(appDir, "NativiteVars.swift"), nativiteVarsTemplate());
  writeFileSync(join(appDir, "NativiteKeyboard.swift"), nativiteKeyboardTemplate(config));

  if (config.updates) {
    writeFileSync(join(appDir, "OTAUpdater.swift"), otaUpdaterTemplate(config));
  }

  if (config.splash) {
    // Write the LaunchScreen storyboard.
    writeFileSync(join(appDir, "LaunchScreen.storyboard"), launchScreenTemplate(config));

    // When an image is specified, copy it into Splash.imageset and write Contents.json.
    if (config.splash.image) {
      const splashImagesetDir = join(assetsDir, "Splash.imageset");
      mkdirSync(splashImagesetDir, { recursive: true });

      const sourceImagePath = resolve(cwd, config.splash.image);
      const imageFilename = basename(sourceImagePath);
      copyFileSync(sourceImagePath, join(splashImagesetDir, imageFilename));
      writeFileSync(
        join(splashImagesetDir, "Contents.json"),
        splashImageContentsTemplate(imageFilename),
      );
    }
  }

  writeFileSync(join(appDir, "Info.plist"), infoPlistTemplate(iosConfig));

  // Write macOS Info.plist when the macOS platform is configured.
  if ((config.platforms ?? []).some((platform) => platform.platform === "macos")) {
    writeFileSync(join(appDir, "Info-macOS.plist"), infoPlistMacOSTemplate(macosConfig));
  }

  // App icon — copy the user's 1024×1024 image into AppIcon.appiconset when configured.
  if (config.icon) {
    const sourceIconPath = resolve(cwd, config.icon);
    const iconFilename = basename(sourceIconPath);
    copyFileSync(sourceIconPath, join(appIconDir, iconFilename));
    writeFileSync(join(appIconDir, "Contents.json"), appIconContentsTemplate(iconFilename));
  } else {
    writeFileSync(join(appIconDir, "Contents.json"), appIconContentsTemplate());
  }

  writeFileSync(
    join(xcodeproj, "project.pbxproj"),
    pbxprojTemplate(config, resolvedPlugins, projectRoot),
  );
  writeFileSync(hashFile, hash);

  return {
    skipped: false,
    projectPath: xcodeproj,
    hash,
  };
}
