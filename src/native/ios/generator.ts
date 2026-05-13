import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BackgroundTaskManifest } from "../../background.ts";
import type { NativiteConfig } from "../../index.ts";
import type { NativitePluginMode } from "../../index.ts";

import { resolveConfigForPlatform } from "../../platforms/registry.ts";
import { resolveNativitePlugins } from "../../plugins/resolve.ts";
import {
  inspectNativeAsset,
  nativeAssetHashInput,
  writeAppleIconAsset,
  writeAppleSplashAsset,
} from "../assets.ts";
import {
  BACKGROUND_MANIFEST_RELATIVE_PATH,
  backgroundTaskHashInputs,
  buildBackgroundTaskBundles,
  createBackgroundTaskManifestFromEntries,
  resolveBackgroundTaskEntries,
  serializeBackgroundTaskManifest,
  writeBackgroundTaskBundles,
  writeBackgroundTaskManifest,
} from "../background-manifest.ts";
import { appDelegateTemplate } from "./app-delegate.ts";
import { appIconContentsTemplate } from "./app-icon-contents.ts";
import { hashConfigForGeneration } from "./hash.ts";
import { infoPlistMacOSTemplate, infoPlistTemplate } from "./info-plist.ts";
import { launchScreenTemplate } from "./launch-screen.ts";
import { mainEntryTemplate } from "./main-entry.ts";
import { nativitePluginRegistrantTemplate } from "./nativite-plugin-registrant.ts";
import { pbxprojTemplate } from "./pbxproj.ts";
import { splashImageContentsTemplate } from "./splash-image-contents.ts";

const runtimeDir = join(dirname(fileURLToPath(import.meta.url)), "runtime");

function readRuntimeFile(filename: string): string {
  return readFileSync(join(runtimeDir, filename), "utf-8");
}

function generationHashInputs(
  config: NativiteConfig,
  resolvedPlugins: Awaited<ReturnType<typeof resolveNativitePlugins>>,
  targetPlatform: AppleTargetPlatform,
  projectRoot: string,
  cwd: string,
  backgroundTaskManifest: BackgroundTaskManifest,
  backgroundTaskManifestJSON: string,
) {
  const platformConfig = resolveConfigForPlatform(config, targetPlatform);
  const platformIcon = platformConfig.icon;
  const platformSplashImage = platformConfig.splash?.image;
  const appIconFilename = platformIcon ? "AppIcon.png" : undefined;
  const splashImageFilename = platformSplashImage ? "Splash.png" : undefined;

  return [
    nativeAssetHashInput(cwd, platformIcon, "icon"),
    nativeAssetHashInput(cwd, platformSplashImage, "splash"),
    {
      name: "NativiteApp.swift",
      content: mainEntryTemplate({ toolbarStyle: config.defaultChrome?.toolbar?.toolbarStyle }),
    },
    { name: "AppDelegate.swift", content: appDelegateTemplate(config) },
    { name: "NativiteConfig.swift", content: nativiteConfigTemplate(config) },
    {
      name: "NativiteBackgroundTasks.swift",
      content: readRuntimeFile("NativiteBackgroundTasks.swift"),
    },
    { name: BACKGROUND_MANIFEST_RELATIVE_PATH, content: backgroundTaskManifestJSON },
    { name: "ViewController.swift", content: readRuntimeFile("ViewController.swift") },
    { name: "NativiteBridge.swift", content: readRuntimeFile("NativiteBridge.swift") },
    {
      name: "NativitePluginRegistrant.swift",
      content: nativitePluginRegistrantTemplate(resolvedPlugins),
    },
    { name: "NativiteChrome.swift", content: readRuntimeFile("NativiteChrome.swift") },
    { name: "NativiteChromeState.swift", content: readRuntimeFile("NativiteChromeState.swift") },
    { name: "NativiteVars.swift", content: readRuntimeFile("NativiteVars.swift") },
    { name: "NativiteKeyboard.swift", content: readRuntimeFile("NativiteKeyboard.swift") },
    { name: "OTAUpdater.swift", content: readRuntimeFile("OTAUpdater.swift") },
    {
      name: "Info.plist",
      content:
        targetPlatform === "ios"
          ? infoPlistTemplate(platformConfig, backgroundTaskManifest)
          : infoPlistMacOSTemplate(platformConfig),
    },
    { name: "AppIcon.appiconset/Contents.json", content: appIconContentsTemplate(appIconFilename) },
    ...(targetPlatform === "ios" && config.splash
      ? [
          { name: "LaunchScreen.storyboard", content: launchScreenTemplate(config) },
          ...(splashImageFilename
            ? [
                {
                  name: "Splash.imageset/Contents.json",
                  content: splashImageContentsTemplate(splashImageFilename),
                },
              ]
            : []),
        ]
      : []),
    {
      name: "project.pbxproj",
      content: pbxprojTemplate(config, resolvedPlugins, projectRoot, targetPlatform),
    },
  ].filter((input) => input !== undefined);
}

function nativiteConfigTemplate(config: NativiteConfig): string {
  const otaEnabled = Boolean(config.updates);
  const otaServerURL = config.updates?.url ?? "";
  const otaChannel = config.updates?.channel ?? "";
  const otaSigningPublicKey = config.updates?.signingPublicKey ?? "";
  const otaAllowInsecureHTTP = config.updates?.allowInsecureHTTP ?? false;
  const defaultChromeStateJSON = config.defaultChrome
    ? JSON.stringify(JSON.stringify(config.defaultChrome))
    : "nil";

  return `// Generated by Nativite — do not edit.
enum NativiteConfig {
    static let otaEnabled: Bool = ${otaEnabled}
    static let otaServerURL: String = ${JSON.stringify(otaServerURL)}
    static let otaChannel: String = ${JSON.stringify(otaChannel)}
    static let otaSigningPublicKey: String = ${JSON.stringify(otaSigningPublicKey)}
    static let otaAllowInsecureHTTP: Bool = ${otaAllowInsecureHTTP}
    static let appVersion: String = ${JSON.stringify(config.app.version)}
    static let defaultChromeStateJSON: String? = ${defaultChromeStateJSON}
}
`;
}

function validateIOSBackgroundTaskManifest(backgroundTaskManifest: BackgroundTaskManifest): void {
  for (const task of backgroundTaskManifest.tasks) {
    const iosMetadata = task.platforms.ios;
    if (!iosMetadata || typeof iosMetadata !== "object") continue;

    const kind = (iosMetadata as { kind?: unknown }).kind;
    if (kind !== "app-refresh") {
      throw new Error(
        `Unsupported iOS background task kind for "${task.id}". Nativite currently supports ios.kind: "app-refresh" only.`,
      );
    }
  }
}

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
  const backgroundTaskEntries = await resolveBackgroundTaskEntries(config, cwd);
  const backgroundTaskManifest = createBackgroundTaskManifestFromEntries(backgroundTaskEntries);
  if (targetPlatform === "ios") {
    validateIOSBackgroundTaskManifest(backgroundTaskManifest);
  }
  const backgroundTaskManifestJSON = serializeBackgroundTaskManifest(backgroundTaskManifest);
  const backgroundTaskBundles = await buildBackgroundTaskBundles(backgroundTaskEntries, cwd);
  const hash = hashConfigForGeneration(config, resolvedPlugins, [
    ...generationHashInputs(
      config,
      resolvedPlugins,
      targetPlatform,
      projectRoot,
      cwd,
      backgroundTaskManifest,
      backgroundTaskManifestJSON,
    ),
    ...backgroundTaskHashInputs(backgroundTaskBundles),
  ]);

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
  writeFileSync(join(appDir, "NativiteConfig.swift"), nativiteConfigTemplate(config));
  writeFileSync(
    join(appDir, "NativiteBackgroundTasks.swift"),
    readRuntimeFile("NativiteBackgroundTasks.swift"),
  );
  writeFileSync(join(appDir, "ViewController.swift"), readRuntimeFile("ViewController.swift"));
  writeFileSync(join(appDir, "NativiteBridge.swift"), readRuntimeFile("NativiteBridge.swift"));
  writeFileSync(
    join(appDir, "NativitePluginRegistrant.swift"),
    nativitePluginRegistrantTemplate(resolvedPlugins),
  );
  writeFileSync(join(appDir, "NativiteChrome.swift"), readRuntimeFile("NativiteChrome.swift"));
  writeFileSync(
    join(appDir, "NativiteChromeState.swift"),
    readRuntimeFile("NativiteChromeState.swift"),
  );
  writeFileSync(join(appDir, "NativiteVars.swift"), readRuntimeFile("NativiteVars.swift"));
  writeFileSync(join(appDir, "NativiteKeyboard.swift"), readRuntimeFile("NativiteKeyboard.swift"));
  writeFileSync(join(appDir, "OTAUpdater.swift"), readRuntimeFile("OTAUpdater.swift"));
  writeBackgroundTaskManifest(backgroundTaskManifest, appDir);
  writeBackgroundTaskBundles(backgroundTaskBundles, appDir);

  // iOS-only: LaunchScreen storyboard and splash image
  if (targetPlatform === "ios" && config.splash) {
    writeFileSync(join(appDir, "LaunchScreen.storyboard"), launchScreenTemplate(config));

    if (platformConfig.splash?.image) {
      const splashImagesetDir = join(assetsDir, "Splash.imageset");
      mkdirSync(splashImagesetDir, { recursive: true });
      const imageFilename = await writeAppleSplashAsset(
        inspectNativeAsset(cwd, platformConfig.splash.image, "splash"),
        splashImagesetDir,
      );
      writeFileSync(
        join(splashImagesetDir, "Contents.json"),
        splashImageContentsTemplate(imageFilename),
      );
    }
  }

  // Info.plist — platform-specific
  if (targetPlatform === "ios") {
    writeFileSync(
      join(appDir, "Info.plist"),
      infoPlistTemplate(platformConfig, backgroundTaskManifest),
    );
  } else {
    writeFileSync(join(appDir, "Info.plist"), infoPlistMacOSTemplate(platformConfig));
  }

  // App icon — normalize the configured source into AppIcon.appiconset when configured.
  if (platformConfig.icon) {
    const iconFilename = await writeAppleIconAsset(
      inspectNativeAsset(cwd, platformConfig.icon, "icon"),
      appIconDir,
    );
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
