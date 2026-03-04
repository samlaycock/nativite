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
import { mainEntryTemplate } from "./templates/main-entry.ts";
import { nativiteBridgeTemplate } from "./templates/nativite-bridge.ts";
import { nativiteChromeStateTemplate } from "./templates/nativite-chrome-state.ts";
import { nativiteChromeTemplate } from "./templates/nativite-chrome.ts";
import { nativiteKeyboardTemplate } from "./templates/nativite-keyboard.ts";
import { nativitePluginRegistrantTemplate } from "./templates/nativite-plugin-registrant.ts";
import { nativiteVarsTemplate } from "./templates/nativite-vars.ts";
import { otaUpdaterTemplate } from "./templates/ota-updater.ts";
import { pbxprojTemplate } from "./templates/pbxproj.ts";
import { splashImageContentsTemplate } from "./templates/splash-image-contents.ts";
import { viewControllerTemplate } from "./templates/view-controller.ts";

export type AppleTargetPlatform = "ios" | "macos";

export type GenerateResult = {
  skipped: boolean;
  projectPath: string;
  hash: string;
};

function requiresLegacyProjectRefresh(
  targetPlatform: AppleTargetPlatform,
  projectRoot: string,
  appName: string,
): boolean {
  const projectPath = join(projectRoot, `${appName}.xcodeproj`, "project.pbxproj");
  if (!existsSync(projectPath)) return true;

  try {
    const pbxproj = readFileSync(projectPath, "utf-8");
    // Ensure NativiteApp.swift entry point is present (SwiftUI @main)
    if (!pbxproj.includes("NativiteApp.swift")) return true;
    // Ensure SwiftUI migration has been applied (NativiteRootView lives in AppDelegate.swift)
    if (!pbxproj.includes("AppDelegate.swift")) return true;
    // Ensure NativiteChromeState.swift observable model is present
    if (!pbxproj.includes("NativiteChromeState.swift")) return true;
    if (targetPlatform === "ios") {
      if (!pbxproj.includes('SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";')) return true;
      if (!pbxproj.includes("SDKROOT = iphoneos;")) return true;
      if (!pbxproj.includes("$SRCROOT/../../../dist-ios")) return true;
    } else {
      if (!pbxproj.includes("SDKROOT = macosx;")) return true;
      if (!pbxproj.includes("$SRCROOT/../../../dist-macos")) return true;
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
  targetPlatform: AppleTargetPlatform = "ios",
): Promise<GenerateResult> {
  const nativiteDir = join(cwd, ".nativite");
  const hashFile = join(nativiteDir, `.hash-${targetPlatform}`);
  const projectRoot = join(nativiteDir, targetPlatform);
  const appName = config.app.name;
  const platformConfig = resolveConfigForPlatform(config, targetPlatform);
  const resolvedPlugins = await resolveNativitePlugins(config, cwd, mode);
  const hash = hashConfigForGeneration(config, resolvedPlugins);

  // Dirty check — skip if nothing has changed
  if (!force && existsSync(hashFile)) {
    const existingHash = readFileSync(hashFile, "utf-8").trim();
    if (
      existingHash === hash &&
      !requiresLegacyProjectRefresh(targetPlatform, projectRoot, appName)
    ) {
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

  // Swift source files — shared across both platforms (use #if os() guards)
  writeFileSync(
    join(appDir, "NativiteApp.swift"),
    mainEntryTemplate({ toolbarStyle: config.defaultChrome?.toolbar?.toolbarStyle }),
  );
  writeFileSync(join(appDir, "AppDelegate.swift"), appDelegateTemplate(config));
  writeFileSync(join(appDir, "ViewController.swift"), viewControllerTemplate(config));
  writeFileSync(join(appDir, "NativiteBridge.swift"), nativiteBridgeTemplate(config));
  writeFileSync(
    join(appDir, "NativitePluginRegistrant.swift"),
    nativitePluginRegistrantTemplate(resolvedPlugins),
  );
  writeFileSync(join(appDir, "NativiteChrome.swift"), nativiteChromeTemplate(config));
  writeFileSync(join(appDir, "NativiteChromeState.swift"), nativiteChromeStateTemplate());
  writeFileSync(join(appDir, "NativiteVars.swift"), nativiteVarsTemplate());
  writeFileSync(join(appDir, "NativiteKeyboard.swift"), nativiteKeyboardTemplate(config));

  if (config.updates) {
    writeFileSync(join(appDir, "OTAUpdater.swift"), otaUpdaterTemplate(config));
  }

  // iOS-only: LaunchScreen storyboard and splash image
  if (targetPlatform === "ios" && config.splash) {
    writeFileSync(join(appDir, "LaunchScreen.storyboard"), launchScreenTemplate(config));

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

  // Info.plist — platform-specific
  if (targetPlatform === "ios") {
    writeFileSync(join(appDir, "Info.plist"), infoPlistTemplate(platformConfig));
  } else {
    writeFileSync(join(appDir, "Info.plist"), infoPlistMacOSTemplate(platformConfig));
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
    pbxprojTemplate(config, resolvedPlugins, projectRoot, targetPlatform),
  );
  writeFileSync(hashFile, hash);

  return {
    skipped: false,
    projectPath: xcodeproj,
    hash,
  };
}
