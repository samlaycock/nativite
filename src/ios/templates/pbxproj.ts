import { createHash } from "node:crypto";
import { basename, extname, relative } from "node:path";

import type { NativiteConfig } from "../../index.ts";
import type {
  ResolvedNativiteFrameworkDependency,
  ResolvedNativitePluginFile,
  ResolvedNativitePlugins,
} from "../../plugins/resolve.ts";

import { resolveConfigForPlatform } from "../../platforms/registry.ts";

function deterministicUuid(seed: string): string {
  return createHash("sha1").update(seed).digest("hex").slice(0, 24).toUpperCase();
}

function toPbxPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function escapePbxString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function quotedPbx(value: string): string {
  return `"${escapePbxString(value)}"`;
}

function sourceFileType(absolutePath: string): string {
  const ext = extname(absolutePath).toLowerCase();
  if (ext === ".swift") return "sourcecode.swift";
  if (ext === ".m") return "sourcecode.c.objc";
  if (ext === ".mm") return "sourcecode.cpp.objcpp";
  if (ext === ".c") return "sourcecode.c.c";
  if (ext === ".cc" || ext === ".cpp" || ext === ".cxx") return "sourcecode.cpp.cpp";
  if (ext === ".metal") return "sourcecode.metal";
  if (ext === ".h" || ext === ".hpp") return "sourcecode.c.h";
  return "text";
}

function resourceFileType(absolutePath: string): string {
  const ext = extname(absolutePath).toLowerCase();
  if (ext === ".storyboard") return "file.storyboard";
  if (ext === ".xcassets") return "folder.assetcatalog";
  if (ext === ".plist") return "text.plist.xml";
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".webp") {
    return "image";
  }
  if (ext === ".json") return "text.json";
  return "file";
}

// Static UUIDs — safe because the project is always fully regenerated from scratch.
// All UUIDs must be exactly 24 hex characters (96 bits) as expected by Xcode.
const UUID = {
  project: "111111111111111111111111",
  appTarget: "222222222222222222222222",
  rootGroup: "333333333333333333333333",
  sourcesGroup: "444444444444444444444444",
  productsGroup: "555555555555555555555555",
  appProduct: "666666666666666666666666",
  appDelegateFile: "AA0000000000000000000001",
  viewControllerFile: "AA0000000000000000000002",
  bridgeFile: "AA0000000000000000000003",
  otaUpdaterFile: "AA0000000000000000000004",
  infoPlistFile: "AA0000000000000000000005",
  assetsFile: "AA0000000000000000000006",
  chromeFile: "AA0000000000000000000007",
  varsFile: "AA0000000000000000000008",
  keyboardFile: "AA0000000000000000000009",
  launchScreenFile: "AA000000000000000000000A",
  pluginRegistrantFile: "AA000000000000000000000C",
  appDelegateBuildFile: "BB0000000000000000000001",
  viewControllerBuildFile: "BB0000000000000000000002",
  bridgeBuildFile: "BB0000000000000000000003",
  otaUpdaterBuildFile: "BB0000000000000000000004",
  assetsBuildFile: "BB0000000000000000000005",
  chromeBuildFile: "BB0000000000000000000006",
  varsBuildFile: "BB0000000000000000000007",
  keyboardBuildFile: "BB0000000000000000000008",
  launchScreenBuildFile: "BB0000000000000000000009",
  pluginRegistrantBuildFile: "BB0000000000000000000012",
  webKitFileRef: "CC0000000000000000000001",
  webKitBuildFile: "CC0000000000000000000002",
  sourcesBuildPhase: "DD0000000000000000000001",
  frameworksBuildPhase: "DD0000000000000000000002",
  resourcesBuildPhase: "DD0000000000000000000003",
  copyDistBuildPhase: "DD0000000000000000000004",
  projectDebugConfig: "EE0000000000000000000001",
  projectReleaseConfig: "EE0000000000000000000002",
  targetDebugConfig: "EE0000000000000000000003",
  targetReleaseConfig: "EE0000000000000000000004",
  projectConfigList: "FF0000000000000000000001",
  targetConfigList: "FF0000000000000000000002",
};

export function pbxprojTemplate(
  config: NativiteConfig,
  resolvedPlugins: ResolvedNativitePlugins,
  projectRoot: string,
  targetPlatform: "ios" | "macos",
): string {
  const appName = config.app.name;
  const platformConfig = resolveConfigForPlatform(config, targetPlatform);
  const platformEntry = (config.platforms ?? []).find(
    (platform) => platform.platform === targetPlatform,
  ) as { minimumVersion?: string } | undefined;
  const appId = platformConfig.app.bundleId;
  const hasOta = Boolean(config.updates);
  const hasSplash = Boolean(config.splash) && targetPlatform === "ios";
  const marketingVersion = platformConfig.app.version;
  const buildNumber = platformConfig.app.buildNumber;

  const isMacos = targetPlatform === "macos";

  const deploymentTarget = isMacos
    ? (platformEntry?.minimumVersion ?? "14.0")
    : (platformEntry?.minimumVersion ?? "17.0");

  const teamId = isMacos
    ? (platformConfig.signing?.macos?.teamId ?? platformConfig.signing?.ios?.teamId)
    : platformConfig.signing?.ios?.teamId;

  // DEVELOPMENT_TEAM is only set when signing config is provided
  const devTeamSetting = teamId ? `\n\t\t\t\tDEVELOPMENT_TEAM = ${teamId};` : "";

  const pluginSources = resolvedPlugins.platforms[targetPlatform].sources;
  const pluginResources = resolvedPlugins.platforms[targetPlatform].resources;
  const frameworkDeps = resolvedPlugins.platforms[targetPlatform].dependencies.filter(
    (dep) => dep.name !== "WebKit",
  );

  type PluginFileRef = {
    id: string;
    displayName: string;
    path: string;
    fileType: string;
  };

  const pluginFileRefsByPath = new Map<string, PluginFileRef>();

  function ensurePluginFileRef(
    file: ResolvedNativitePluginFile,
    type: "source" | "resource",
  ): PluginFileRef {
    const existing = pluginFileRefsByPath.get(file.absolutePath);
    if (existing) return existing;

    const pathFromProjectRoot = toPbxPath(relative(projectRoot, file.absolutePath));
    const ref: PluginFileRef = {
      id: deterministicUuid(`plugin:file:${file.absolutePath}`),
      displayName: basename(file.absolutePath),
      path: pathFromProjectRoot,
      fileType:
        type === "source" ? sourceFileType(file.absolutePath) : resourceFileType(file.absolutePath),
    };
    pluginFileRefsByPath.set(file.absolutePath, ref);
    return ref;
  }

  const pluginSourceBuildIds = pluginSources.map((file) =>
    deterministicUuid(`plugin:${targetPlatform}:source-build:${file.absolutePath}`),
  );

  const pluginResourceBuildIds = pluginResources.map((file) =>
    deterministicUuid(`plugin:${targetPlatform}:resource-build:${file.absolutePath}`),
  );

  type FrameworkRef = {
    fileRef: string;
    buildFile: string;
    dep: ResolvedNativiteFrameworkDependency;
  };

  const frameworkRefsByName = new Map<string, FrameworkRef>();
  for (const dep of frameworkDeps) {
    if (!frameworkRefsByName.has(dep.name)) {
      frameworkRefsByName.set(dep.name, {
        fileRef: deterministicUuid(`plugin:framework:file:${dep.name}`),
        buildFile: deterministicUuid(
          `plugin:framework:${targetPlatform}-build:${dep.name}:${dep.weak}`,
        ),
        dep,
      });
    }
  }

  // ── PBXBuildFile entries ──────────────────────────────────────────────────

  const sourcesBuildFiles = [
    `\t\t${UUID.appDelegateBuildFile} /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.appDelegateFile} /* AppDelegate.swift */; };`,
    `\t\t${UUID.viewControllerBuildFile} /* ViewController.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.viewControllerFile} /* ViewController.swift */; };`,
    `\t\t${UUID.bridgeBuildFile} /* NativiteBridge.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.bridgeFile} /* NativiteBridge.swift */; };`,
    `\t\t${UUID.pluginRegistrantBuildFile} /* NativitePluginRegistrant.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.pluginRegistrantFile} /* NativitePluginRegistrant.swift */; };`,
    `\t\t${UUID.chromeBuildFile} /* NativiteChrome.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.chromeFile} /* NativiteChrome.swift */; };`,
    `\t\t${UUID.varsBuildFile} /* NativiteVars.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.varsFile} /* NativiteVars.swift */; };`,
    `\t\t${UUID.keyboardBuildFile} /* NativiteKeyboard.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.keyboardFile} /* NativiteKeyboard.swift */; };`,
    ...(hasOta
      ? [
          `\t\t${UUID.otaUpdaterBuildFile} /* OTAUpdater.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.otaUpdaterFile} /* OTAUpdater.swift */; };`,
        ]
      : []),
    ...pluginSources.map((file, index) => {
      const fileRef = ensurePluginFileRef(file, "source");
      const buildId = pluginSourceBuildIds[index];
      return `\t\t${buildId} /* ${fileRef.displayName} in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRef.id} /* ${fileRef.displayName} */; };`;
    }),
  ].join("\n");

  // ── PBXFileReference entries ──────────────────────────────────────────────

  const sourceFileRefs = [
    `\t\t${UUID.appDelegateFile} /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppDelegate.swift; sourceTree = "<group>"; };`,
    `\t\t${UUID.viewControllerFile} /* ViewController.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ViewController.swift; sourceTree = "<group>"; };`,
    `\t\t${UUID.bridgeFile} /* NativiteBridge.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NativiteBridge.swift; sourceTree = "<group>"; };`,
    `\t\t${UUID.pluginRegistrantFile} /* NativitePluginRegistrant.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NativitePluginRegistrant.swift; sourceTree = "<group>"; };`,
    `\t\t${UUID.chromeFile} /* NativiteChrome.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NativiteChrome.swift; sourceTree = "<group>"; };`,
    `\t\t${UUID.varsFile} /* NativiteVars.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NativiteVars.swift; sourceTree = "<group>"; };`,
    `\t\t${UUID.keyboardFile} /* NativiteKeyboard.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NativiteKeyboard.swift; sourceTree = "<group>"; };`,
    ...(hasOta
      ? [
          `\t\t${UUID.otaUpdaterFile} /* OTAUpdater.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = OTAUpdater.swift; sourceTree = "<group>"; };`,
        ]
      : []),
    ...[...pluginFileRefsByPath.values()].map((ref) => {
      return `\t\t${ref.id} /* ${ref.displayName} */ = {isa = PBXFileReference; lastKnownFileType = ${ref.fileType}; path = ${quotedPbx(ref.path)}; sourceTree = SOURCE_ROOT; };`;
    }),
  ].join("\n");

  // ── Sources group children ────────────────────────────────────────────────

  const sourcesGroupChildren = [
    UUID.appDelegateFile,
    UUID.viewControllerFile,
    UUID.bridgeFile,
    UUID.pluginRegistrantFile,
    UUID.chromeFile,
    UUID.varsFile,
    UUID.keyboardFile,
    ...(hasOta ? [UUID.otaUpdaterFile] : []),
    ...(hasSplash ? [UUID.launchScreenFile] : []),
    UUID.infoPlistFile,
    UUID.assetsFile,
    ...[...pluginFileRefsByPath.values()].map((ref) => ref.id),
  ]
    .map((id) => `\t\t\t\t${id},`)
    .join("\n");

  // ── Sources build phase files ─────────────────────────────────────────────

  const sourcesPhaseFiles = [
    UUID.appDelegateBuildFile,
    UUID.viewControllerBuildFile,
    UUID.bridgeBuildFile,
    UUID.pluginRegistrantBuildFile,
    UUID.chromeBuildFile,
    UUID.varsBuildFile,
    UUID.keyboardBuildFile,
    ...(hasOta ? [UUID.otaUpdaterBuildFile] : []),
    ...pluginSourceBuildIds,
  ]
    .map((id) => `\t\t\t\t${id} /* .swift in Sources */,`)
    .join("\n");

  // ── Products group children ───────────────────────────────────────────────

  const productsChildren = `\t\t\t\t${UUID.appProduct} /* ${appName}.app */,`;

  // ── Project-level build settings ──────────────────────────────────────────

  const projectSdkSettings = isMacos
    ? `\t\t\t\tMACOSX_DEPLOYMENT_TARGET = ${deploymentTarget};\n\t\t\t\tSDKROOT = macosx;\n`
    : `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${deploymentTarget};\n\t\t\t\tSDKROOT = iphoneos;\n`;

  // ── Target attributes ─────────────────────────────────────────────────────

  const targetAttributes = `\t\t\t\t\t${UUID.appTarget} = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;\n\t\t\t\t\t};`;

  // ── Targets array ─────────────────────────────────────────────────────────

  const targetsArray = `\t\t\t\t${UUID.appTarget} /* ${appName} */,`;

  // ── Copy Web Bundle shell script ──────────────────────────────────────────

  const distDir = isMacos ? "dist-macos" : "dist-ios";
  const platformLabel = isMacos ? "macOS" : "iOS";
  const copyDistScript = `# Copy the ${platformLabel} web bundle into the app bundle\\nDIST_SRC=\\"$SRCROOT/../../../${distDir}\\"\\nDIST_DEST=\\"$CODESIGNING_FOLDER_PATH/dist\\"\\nif [ ! -d \\"$DIST_SRC\\" ]; then\\n  if [ \\"$CONFIGURATION\\" = \\"Release\\" ]; then\\n    echo \\"error: Missing web bundle at $DIST_SRC. Run: npx nativite build --platform ${targetPlatform}\\"\\n    exit 1\\n  fi\\n  echo \\"warning: Missing $DIST_SRC (skipping copy in $CONFIGURATION build)\\"\\n  exit 0\\nfi\\nrm -rf \\"$DIST_DEST\\"\\ncp -R \\"$DIST_SRC\\" \\"$DIST_DEST\\"\\nDEV_JSON_SRC=\\"$SRCROOT/../dev.json\\"\\nDEV_JSON_DEST=\\"$CODESIGNING_FOLDER_PATH/dev.json\\"\\nif [ -f \\"$DEV_JSON_SRC\\" ]; then\\n  cp \\"$DEV_JSON_SRC\\" \\"$DEV_JSON_DEST\\"\\nfi\\n`;

  const pluginResourceBuildFiles = pluginResources.map((file, index) => {
    const fileRef = ensurePluginFileRef(file, "resource");
    const buildId = pluginResourceBuildIds[index];
    return `\t\t${buildId} /* ${fileRef.displayName} in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef.id} /* ${fileRef.displayName} */; };`;
  });

  const frameworkFileRefs = [...frameworkRefsByName.values()].map((framework) => {
    const frameworkName = `${framework.dep.name}.framework`;
    return `\t\t${framework.fileRef} /* ${frameworkName} */ = {isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = ${quotedPbx(frameworkName)}; path = ${quotedPbx(`System/Library/Frameworks/${frameworkName}`)}; sourceTree = SDKROOT; };`;
  });

  const frameworkBuildFiles = [...frameworkRefsByName.values()].map((framework) => {
    const frameworkName = `${framework.dep.name}.framework`;
    const settings = framework.dep.weak ? " settings = {ATTRIBUTES = (Weak, ); };" : "";
    return `\t\t${framework.buildFile} /* ${frameworkName} in Frameworks */ = {isa = PBXBuildFile; fileRef = ${framework.fileRef} /* ${frameworkName} */;${settings} };`;
  });

  const frameworkPhaseFiles = [
    `\t\t\t\t${UUID.webKitBuildFile} /* WebKit.framework in Frameworks */,`,
    ...[...frameworkRefsByName.values()].map((framework) => {
      const frameworkName = `${framework.dep.name}.framework`;
      return `\t\t\t\t${framework.buildFile} /* ${frameworkName} in Frameworks */,`;
    }),
  ].join("\n");

  const resourcePhaseFiles = [
    `\t\t\t\t${UUID.assetsBuildFile} /* Assets.xcassets in Resources */,`,
    ...(hasSplash
      ? [`\t\t\t\t${UUID.launchScreenBuildFile} /* LaunchScreen.storyboard in Resources */,`]
      : []),
    ...pluginResourceBuildIds.map((id, index) => {
      const fileRef = ensurePluginFileRef(pluginResources[index]!, "resource");
      return `\t\t\t\t${id} /* ${fileRef.displayName} in Resources */,`;
    }),
  ].join("\n");

  // ── Target-level build settings ──────────────────────────────────────────

  const targetPlatformSettings = isMacos
    ? `\t\t\t\tMACOSX_DEPLOYMENT_TARGET = ${deploymentTarget};
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSUPPORTED_PLATFORMS = macosx;`
    : `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${deploymentTarget};
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator";`;

  const targetDeviceFamilySetting = isMacos ? "" : `\n\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";`;

  const targetBuildSettings = `\t\t${UUID.targetDebugConfig} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCURRENT_PROJECT_VERSION = ${buildNumber};${devTeamSetting}
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = ${appName}/Info.plist;
${targetPlatformSettings}
\t\t\t\tMARKETING_VERSION = ${marketingVersion};
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${appId};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;${targetDeviceFamilySetting}
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${UUID.targetReleaseConfig} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCURRENT_PROJECT_VERSION = ${buildNumber};${devTeamSetting}
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = ${appName}/Info.plist;
${targetPlatformSettings}
\t\t\t\tMARKETING_VERSION = ${marketingVersion};
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${appId};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;${targetDeviceFamilySetting}
\t\t\t};
\t\t\tname = Release;
\t\t};`;

  // ── Assemble pbxproj ──────────────────────────────────────────────────────

  return `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tclasses = {
\t};
\tobjectVersion = 56;
\tobjects = {

/* Begin PBXBuildFile section */
${sourcesBuildFiles}
\t\t${UUID.assetsBuildFile} /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = ${UUID.assetsFile} /* Assets.xcassets */; };
${hasSplash ? `\t\t${UUID.launchScreenBuildFile} /* LaunchScreen.storyboard in Resources */ = {isa = PBXBuildFile; fileRef = ${UUID.launchScreenFile} /* LaunchScreen.storyboard */; };` : ""}
\n${pluginResourceBuildFiles.join("\n")}
\t\t${UUID.webKitBuildFile} /* WebKit.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = ${UUID.webKitFileRef} /* WebKit.framework */; };
${frameworkBuildFiles.length > 0 ? `\n${frameworkBuildFiles.join("\n")}` : ""}
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
\t\t${UUID.appProduct} /* ${appName}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "${appName}.app"; sourceTree = BUILT_PRODUCTS_DIR; };
${sourceFileRefs}
\t\t${UUID.infoPlistFile} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
\t\t${UUID.assetsFile} /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
${hasSplash ? `\t\t${UUID.launchScreenFile} /* LaunchScreen.storyboard */ = {isa = PBXFileReference; lastKnownFileType = file.storyboard; path = LaunchScreen.storyboard; sourceTree = "<group>"; };` : ""}
\t\t${UUID.webKitFileRef} /* WebKit.framework */ = {isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = WebKit.framework; path = System/Library/Frameworks/WebKit.framework; sourceTree = SDKROOT; };
${frameworkFileRefs.length > 0 ? frameworkFileRefs.join("\n") : ""}
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
\t\t${UUID.frameworksBuildPhase} /* Frameworks */ = {
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${frameworkPhaseFiles}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t${UUID.rootGroup} = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${UUID.sourcesGroup} /* ${appName} */,
\t\t\t\t${UUID.productsGroup} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${UUID.productsGroup} /* Products */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${productsChildren}
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${UUID.sourcesGroup} /* ${appName} */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${sourcesGroupChildren}
\t\t\t);
\t\t\tpath = ${appName};
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t${UUID.appTarget} /* ${appName} */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${UUID.targetConfigList} /* Build configuration list for PBXNativeTarget "${appName}" */;
\t\t\tbuildPhases = (
\t\t\t\t${UUID.sourcesBuildPhase} /* Sources */,
\t\t\t\t${UUID.frameworksBuildPhase} /* Frameworks */,
\t\t\t\t${UUID.resourcesBuildPhase} /* Resources */,
\t\t\t\t${UUID.copyDistBuildPhase} /* Copy Web Bundle */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = "${appName}";
\t\t\tproductName = "${appName}";
\t\t\tproductReference = ${UUID.appProduct} /* ${appName}.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t${UUID.project} /* Project object */ = {
\t\t\tisa = PBXProject;
\t\t\tattributes = {
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastUpgradeCheck = 1600;
\t\t\t\tTargetAttributes = {
${targetAttributes}
\t\t\t\t};
\t\t\t};
\t\t\tbuildConfigurationList = ${UUID.projectConfigList} /* Build configuration list for PBXProject "${appName}" */;
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\tdevelopmentRegion = en;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = ${UUID.rootGroup};
\t\t\tminimumXcodeVersion = 16.0;
\t\t\tproductRefGroup = ${UUID.productsGroup} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
${targetsArray}
\t\t\t);
\t\t};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t${UUID.resourcesBuildPhase} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${resourcePhaseFiles}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXResourcesBuildPhase section */

/* Begin PBXShellScriptBuildPhase section */
\t\t${UUID.copyDistBuildPhase} /* Copy Web Bundle */ = {
\t\t\tisa = PBXShellScriptBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\tinputFileListPaths = (
\t\t\t);
\t\t\tinputPaths = (
\t\t\t);
\t\t\tname = "Copy Web Bundle";
\t\t\toutputFileListPaths = (
\t\t\t);
\t\t\toutputPaths = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t\tshellPath = /bin/sh;
\t\t\tshellScript = "${copyDistScript}";
\t\t};
/* End PBXShellScriptBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t${UUID.sourcesBuildPhase} /* Sources */ = {
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${sourcesPhaseFiles}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
\t\t${UUID.projectDebugConfig} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ANALYZER_NONNULL = YES;
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCLANG_ENABLE_OBJC_WEAK = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tENABLE_TESTABILITY = YES;
\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;
\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;
\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;
\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (
\t\t\t\t\t"DEBUG=1",
\t\t\t\t\t"$(inherited)",
\t\t\t\t);
${projectSdkSettings}\t\t\t\tMTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
\t\t\t\tMTL_FAST_MATH = YES;
\t\t\t\tONLY_ACTIVE_ARCH = YES;
\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${UUID.projectReleaseConfig} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ANALYZER_NONNULL = YES;
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCLANG_ENABLE_OBJC_WEAK = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
\t\t\t\tENABLE_NS_ASSERTIONS = NO;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;
${projectSdkSettings}\t\t\t\tMTL_FAST_MATH = YES;
\t\t\t\tSWIFT_COMPILATION_MODE = wholemodule;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-O";
\t\t\t\tVALIDATE_PRODUCT = YES;
\t\t\t};
\t\t\tname = Release;
\t\t};
${targetBuildSettings}
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t${UUID.projectConfigList} /* Build configuration list for PBXProject "${appName}" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${UUID.projectDebugConfig} /* Debug */,
\t\t\t\t${UUID.projectReleaseConfig} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
\t\t${UUID.targetConfigList} /* Build configuration list for PBXNativeTarget "${appName}" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${UUID.targetDebugConfig} /* Debug */,
\t\t\t\t${UUID.targetReleaseConfig} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
/* End XCConfigurationList section */
\t};
\trootObject = ${UUID.project} /* Project object */;
}
`;
}
