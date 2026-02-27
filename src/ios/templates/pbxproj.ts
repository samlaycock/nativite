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
  // ── macOS-specific UUIDs (only used when platforms.macos is set) ───────────
  macAppTarget: "222222222222222222222223",
  macAppProduct: "666666666666666666666667",
  macInfoPlistFile: "AA000000000000000000000B",
  macAppDelegateBuildFile: "BB000000000000000000000A",
  macViewControllerBuildFile: "BB000000000000000000000B",
  macBridgeBuildFile: "BB000000000000000000000C",
  macOtaUpdaterBuildFile: "BB000000000000000000000D",
  macAssetsBuildFile: "BB000000000000000000000E",
  macChromeBuildFile: "BB000000000000000000000F",
  macVarsBuildFile: "BB0000000000000000000010",
  macKeyboardBuildFile: "BB0000000000000000000011",
  macPluginRegistrantBuildFile: "BB0000000000000000000013",
  macWebKitBuildFile: "CC0000000000000000000003",
  macSourcesBuildPhase: "DD0000000000000000000005",
  macFrameworksBuildPhase: "DD0000000000000000000006",
  macResourcesBuildPhase: "DD0000000000000000000007",
  macCopyDistBuildPhase: "DD0000000000000000000008",
  macTargetDebugConfig: "EE0000000000000000000005",
  macTargetReleaseConfig: "EE0000000000000000000006",
  macTargetConfigList: "FF0000000000000000000003",
};

export function pbxprojTemplate(
  config: NativiteConfig,
  resolvedPlugins: ResolvedNativitePlugins,
  projectRoot: string,
): string {
  const appName = config.app.name;
  const iosConfig = resolveConfigForPlatform(config, "ios");
  const macosConfig = resolveConfigForPlatform(config, "macos");
  const iosAppId = iosConfig.app.bundleId;
  const macosAppId = macosConfig.app.bundleId;
  const hasOta = Boolean(config.updates);
  const hasSplash = Boolean(config.splash);
  const hasMacos = Boolean(config.app.platforms.macos);
  const iosDeploymentTarget = config.app.platforms.ios?.minimumVersion ?? "17.0";
  const macosDeploymentTarget = config.app.platforms.macos?.minimumVersion ?? "14.0";
  const iosMarketingVersion = iosConfig.app.version;
  const macosMarketingVersion = macosConfig.app.version;
  const iosBuildNumber = iosConfig.app.buildNumber;
  const macosBuildNumber = macosConfig.app.buildNumber;
  const iosTeamId = iosConfig.signing?.ios?.teamId;
  const macosTeamId = macosConfig.signing?.ios?.teamId;

  // DEVELOPMENT_TEAM is only set when signing config is provided
  const iosDevTeamSetting = iosTeamId ? `\n\t\t\t\tDEVELOPMENT_TEAM = ${iosTeamId};` : "";
  const macosDevTeamSetting = macosTeamId ? `\n\t\t\t\tDEVELOPMENT_TEAM = ${macosTeamId};` : "";

  const iosPluginSources = resolvedPlugins.platforms.ios.sources;
  const macosPluginSources = resolvedPlugins.platforms.macos.sources;
  const iosPluginResources = resolvedPlugins.platforms.ios.resources;
  const macosPluginResources = resolvedPlugins.platforms.macos.resources;
  const iosFrameworkDeps = resolvedPlugins.platforms.ios.dependencies.filter(
    (dep) => dep.name !== "WebKit",
  );
  const macosFrameworkDeps = resolvedPlugins.platforms.macos.dependencies.filter(
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

  const pluginSourceBuildIds = {
    ios: iosPluginSources.map((file) =>
      deterministicUuid(`plugin:ios:source-build:${file.absolutePath}`),
    ),
    macos: macosPluginSources.map((file) =>
      deterministicUuid(`plugin:macos:source-build:${file.absolutePath}`),
    ),
  };

  const pluginResourceBuildIds = {
    ios: iosPluginResources.map((file) =>
      deterministicUuid(`plugin:ios:resource-build:${file.absolutePath}`),
    ),
    macos: macosPluginResources.map((file) =>
      deterministicUuid(`plugin:macos:resource-build:${file.absolutePath}`),
    ),
  };

  type FrameworkRef = {
    fileRef: string;
    iosBuildFile?: string;
    macosBuildFile?: string;
    dep: ResolvedNativiteFrameworkDependency;
  };

  const frameworkRefsByName = new Map<string, FrameworkRef>();
  function ensureFrameworkRef(dep: ResolvedNativiteFrameworkDependency): FrameworkRef {
    const existing = frameworkRefsByName.get(dep.name);
    if (existing) return existing;
    const frameworkRef: FrameworkRef = {
      fileRef: deterministicUuid(`plugin:framework:file:${dep.name}`),
      dep,
    };
    frameworkRefsByName.set(dep.name, frameworkRef);
    return frameworkRef;
  }

  for (const dep of iosFrameworkDeps) {
    const framework = ensureFrameworkRef(dep);
    framework.iosBuildFile = deterministicUuid(
      `plugin:framework:ios-build:${dep.name}:${dep.weak}`,
    );
    if (!dep.weak) framework.dep.weak = false;
  }
  for (const dep of macosFrameworkDeps) {
    const framework = ensureFrameworkRef(dep);
    framework.macosBuildFile = deterministicUuid(
      `plugin:framework:macos-build:${dep.name}:${dep.weak}`,
    );
    if (!dep.weak) framework.dep.weak = false;
  }

  // ── iOS PBXBuildFile entries ──────────────────────────────────────────────

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
    ...iosPluginSources.map((file, index) => {
      const fileRef = ensurePluginFileRef(file, "source");
      const buildId = pluginSourceBuildIds.ios[index];
      return `\t\t${buildId} /* ${fileRef.displayName} in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRef.id} /* ${fileRef.displayName} */; };`;
    }),
  ].join("\n");

  // ── macOS PBXBuildFile entries (same file refs, different build file UUIDs) ─
  // Each target needs its own PBXBuildFile entries referencing the shared
  // PBXFileReference. NativiteKeyboard is included (the file itself has
  // #if os(iOS) guards so it compiles as empty on macOS).

  const macSourcesBuildFiles = hasMacos
    ? [
        `\t\t${UUID.macAppDelegateBuildFile} /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.appDelegateFile} /* AppDelegate.swift */; };`,
        `\t\t${UUID.macViewControllerBuildFile} /* ViewController.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.viewControllerFile} /* ViewController.swift */; };`,
        `\t\t${UUID.macBridgeBuildFile} /* NativiteBridge.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.bridgeFile} /* NativiteBridge.swift */; };`,
        `\t\t${UUID.macPluginRegistrantBuildFile} /* NativitePluginRegistrant.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.pluginRegistrantFile} /* NativitePluginRegistrant.swift */; };`,
        `\t\t${UUID.macChromeBuildFile} /* NativiteChrome.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.chromeFile} /* NativiteChrome.swift */; };`,
        `\t\t${UUID.macVarsBuildFile} /* NativiteVars.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.varsFile} /* NativiteVars.swift */; };`,
        `\t\t${UUID.macKeyboardBuildFile} /* NativiteKeyboard.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.keyboardFile} /* NativiteKeyboard.swift */; };`,
        ...(hasOta
          ? [
              `\t\t${UUID.macOtaUpdaterBuildFile} /* OTAUpdater.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${UUID.otaUpdaterFile} /* OTAUpdater.swift */; };`,
            ]
          : []),
        ...macosPluginSources.map((file, index) => {
          const fileRef = ensurePluginFileRef(file, "source");
          const buildId = pluginSourceBuildIds.macos[index];
          return `\t\t${buildId} /* ${fileRef.displayName} in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRef.id} /* ${fileRef.displayName} */; };`;
        }),
      ].join("\n")
    : "";

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
    ...(hasMacos ? [UUID.macInfoPlistFile] : []),
    UUID.assetsFile,
    ...[...pluginFileRefsByPath.values()].map((ref) => ref.id),
  ]
    .map((id) => `\t\t\t\t${id},`)
    .join("\n");

  // ── iOS Sources build phase files ─────────────────────────────────────────

  const sourcesPhaseFiles = [
    UUID.appDelegateBuildFile,
    UUID.viewControllerBuildFile,
    UUID.bridgeBuildFile,
    UUID.pluginRegistrantBuildFile,
    UUID.chromeBuildFile,
    UUID.varsBuildFile,
    UUID.keyboardBuildFile,
    ...(hasOta ? [UUID.otaUpdaterBuildFile] : []),
    ...pluginSourceBuildIds.ios,
  ]
    .map((id) => `\t\t\t\t${id} /* .swift in Sources */,`)
    .join("\n");

  // ── macOS Sources build phase files ───────────────────────────────────────

  const macSourcesPhaseFiles = hasMacos
    ? [
        UUID.macAppDelegateBuildFile,
        UUID.macViewControllerBuildFile,
        UUID.macBridgeBuildFile,
        UUID.macPluginRegistrantBuildFile,
        UUID.macChromeBuildFile,
        UUID.macVarsBuildFile,
        UUID.macKeyboardBuildFile,
        ...(hasOta ? [UUID.macOtaUpdaterBuildFile] : []),
        ...pluginSourceBuildIds.macos,
      ]
        .map((id) => `\t\t\t\t${id} /* .swift in Sources */,`)
        .join("\n")
    : "";

  // ── Products group children ───────────────────────────────────────────────

  const productsChildren = [
    `\t\t\t\t${UUID.appProduct} /* ${appName}.app */,`,
    ...(hasMacos ? [`\t\t\t\t${UUID.macAppProduct} /* ${appName}.app */,`] : []),
  ].join("\n");

  // ── Project-level build settings ──────────────────────────────────────────
  // When both platforms exist, SDKROOT and deployment target move to the
  // target level so each target can set its own SDK.

  const projectSdkSettings = hasMacos
    ? ""
    : `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${iosDeploymentTarget};\n\t\t\t\tSDKROOT = iphoneos;\n`;

  const iosTargetSdkSettings = `\n\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${iosDeploymentTarget};\n\t\t\t\tSDKROOT = iphoneos;`;

  // ── Target attributes ─────────────────────────────────────────────────────

  const targetAttributes = [
    `\t\t\t\t\t${UUID.appTarget} = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;\n\t\t\t\t\t};`,
    ...(hasMacos
      ? [
          `\t\t\t\t\t${UUID.macAppTarget} = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;\n\t\t\t\t\t};`,
        ]
      : []),
  ].join("\n");

  // ── Targets array ─────────────────────────────────────────────────────────

  const targetsArray = [
    `\t\t\t\t${UUID.appTarget} /* ${appName} */,`,
    ...(hasMacos ? [`\t\t\t\t${UUID.macAppTarget} /* ${appName}-macOS */,`] : []),
  ].join("\n");

  // ── Copy Web Bundle shell script ──────────────────────────────────────────

  const copyIosDistScript =
    '# Copy the iOS web bundle into the app bundle\\nDIST_SRC=\\"$SRCROOT/../../../dist-ios\\"\\nDIST_DEST=\\"$CODESIGNING_FOLDER_PATH/dist\\"\\nif [ ! -d \\"$DIST_SRC\\" ]; then\\n  if [ \\"$CONFIGURATION\\" = \\"Release\\" ]; then\\n    echo \\"error: Missing web bundle at $DIST_SRC. Run: npx nativite build --platform ios\\"\\n    exit 1\\n  fi\\n  echo \\"warning: Missing $DIST_SRC (skipping copy in $CONFIGURATION build)\\"\\n  exit 0\\nfi\\nrm -rf \\"$DIST_DEST\\"\\ncp -R \\"$DIST_SRC\\" \\"$DIST_DEST\\"\\n';
  const copyMacosDistScript =
    '# Copy the macOS web bundle into the app bundle\\nDIST_SRC=\\"$SRCROOT/../../../dist-macos\\"\\nDIST_DEST=\\"$CODESIGNING_FOLDER_PATH/dist\\"\\nif [ ! -d \\"$DIST_SRC\\" ]; then\\n  if [ \\"$CONFIGURATION\\" = \\"Release\\" ]; then\\n    echo \\"error: Missing web bundle at $DIST_SRC. Run: npx nativite build --platform macos\\"\\n    exit 1\\n  fi\\n  echo \\"warning: Missing $DIST_SRC (skipping copy in $CONFIGURATION build)\\"\\n  exit 0\\nfi\\nrm -rf \\"$DIST_DEST\\"\\ncp -R \\"$DIST_SRC\\" \\"$DIST_DEST\\"\\n';

  const iosPluginResourceBuildFiles = iosPluginResources.map((file, index) => {
    const fileRef = ensurePluginFileRef(file, "resource");
    const buildId = pluginResourceBuildIds.ios[index];
    return `\t\t${buildId} /* ${fileRef.displayName} in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef.id} /* ${fileRef.displayName} */; };`;
  });

  const macosPluginResourceBuildFiles = macosPluginResources.map((file, index) => {
    const fileRef = ensurePluginFileRef(file, "resource");
    const buildId = pluginResourceBuildIds.macos[index];
    return `\t\t${buildId} /* ${fileRef.displayName} in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef.id} /* ${fileRef.displayName} */; };`;
  });

  const frameworkFileRefs = [...frameworkRefsByName.values()].map((framework) => {
    const frameworkName = `${framework.dep.name}.framework`;
    return `\t\t${framework.fileRef} /* ${frameworkName} */ = {isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = ${quotedPbx(frameworkName)}; path = ${quotedPbx(`System/Library/Frameworks/${frameworkName}`)}; sourceTree = SDKROOT; };`;
  });

  const iosFrameworkBuildFiles = [...frameworkRefsByName.values()]
    .filter((framework) => framework.iosBuildFile !== undefined)
    .map((framework) => {
      const frameworkName = `${framework.dep.name}.framework`;
      const settings = framework.dep.weak ? " settings = {ATTRIBUTES = (Weak, ); };" : "";
      return `\t\t${framework.iosBuildFile!} /* ${frameworkName} in Frameworks */ = {isa = PBXBuildFile; fileRef = ${framework.fileRef} /* ${frameworkName} */;${settings} };`;
    });

  const macosFrameworkBuildFiles = [...frameworkRefsByName.values()]
    .filter((framework) => framework.macosBuildFile !== undefined)
    .map((framework) => {
      const frameworkName = `${framework.dep.name}.framework`;
      const settings = framework.dep.weak ? " settings = {ATTRIBUTES = (Weak, ); };" : "";
      return `\t\t${framework.macosBuildFile!} /* ${frameworkName} in Frameworks */ = {isa = PBXBuildFile; fileRef = ${framework.fileRef} /* ${frameworkName} */;${settings} };`;
    });

  const iosFrameworkPhaseFiles = [
    `\t\t\t\t${UUID.webKitBuildFile} /* WebKit.framework in Frameworks */,`,
    ...[...frameworkRefsByName.values()]
      .filter((framework) => framework.iosBuildFile !== undefined)
      .map((framework) => {
        const frameworkName = `${framework.dep.name}.framework`;
        return `\t\t\t\t${framework.iosBuildFile!} /* ${frameworkName} in Frameworks */,`;
      }),
  ].join("\n");

  const macosFrameworkPhaseFiles = [
    `\t\t\t\t${UUID.macWebKitBuildFile} /* WebKit.framework in Frameworks */,`,
    ...[...frameworkRefsByName.values()]
      .filter((framework) => framework.macosBuildFile !== undefined)
      .map((framework) => {
        const frameworkName = `${framework.dep.name}.framework`;
        return `\t\t\t\t${framework.macosBuildFile!} /* ${frameworkName} in Frameworks */,`;
      }),
  ].join("\n");

  const iosResourcePhaseFiles = [
    `\t\t\t\t${UUID.assetsBuildFile} /* Assets.xcassets in Resources */,`,
    ...(hasSplash
      ? [`\t\t\t\t${UUID.launchScreenBuildFile} /* LaunchScreen.storyboard in Resources */,`]
      : []),
    ...pluginResourceBuildIds.ios.map((id, index) => {
      const fileRef = ensurePluginFileRef(iosPluginResources[index]!, "resource");
      return `\t\t\t\t${id} /* ${fileRef.displayName} in Resources */,`;
    }),
  ].join("\n");

  const macosResourcePhaseFiles = [
    `\t\t\t\t${UUID.macAssetsBuildFile} /* Assets.xcassets in Resources */,`,
    ...pluginResourceBuildIds.macos.map((id, index) => {
      const fileRef = ensurePluginFileRef(macosPluginResources[index]!, "resource");
      return `\t\t\t\t${id} /* ${fileRef.displayName} in Resources */,`;
    }),
  ].join("\n");

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
\n${iosPluginResourceBuildFiles.join("\n")}
\t\t${UUID.webKitBuildFile} /* WebKit.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = ${UUID.webKitFileRef} /* WebKit.framework */; };
${iosFrameworkBuildFiles.length > 0 ? `\n${iosFrameworkBuildFiles.join("\n")}` : ""}
${hasMacos ? `${macSourcesBuildFiles}\n\t\t${UUID.macAssetsBuildFile} /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = ${UUID.assetsFile} /* Assets.xcassets */; };\n${macosPluginResourceBuildFiles.join("\n")}\n\t\t${UUID.macWebKitBuildFile} /* WebKit.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = ${UUID.webKitFileRef} /* WebKit.framework */; };${macosFrameworkBuildFiles.length > 0 ? `\n${macosFrameworkBuildFiles.join("\n")}` : ""}` : ""}
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
\t\t${UUID.appProduct} /* ${appName}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "${appName}.app"; sourceTree = BUILT_PRODUCTS_DIR; };
${hasMacos ? `\t\t${UUID.macAppProduct} /* ${appName}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "${appName}.app"; sourceTree = BUILT_PRODUCTS_DIR; };` : ""}
${sourceFileRefs}
\t\t${UUID.infoPlistFile} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
${hasMacos ? `\t\t${UUID.macInfoPlistFile} /* Info-macOS.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "Info-macOS.plist"; sourceTree = "<group>"; };` : ""}
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
${iosFrameworkPhaseFiles}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
${
  hasMacos
    ? `\t\t${UUID.macFrameworksBuildPhase} /* Frameworks */ = {
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${macosFrameworkPhaseFiles}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};`
    : ""
}
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
${
  hasMacos
    ? `\t\t${UUID.macAppTarget} /* ${appName}-macOS */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${UUID.macTargetConfigList} /* Build configuration list for PBXNativeTarget "${appName}-macOS" */;
\t\t\tbuildPhases = (
\t\t\t\t${UUID.macSourcesBuildPhase} /* Sources */,
\t\t\t\t${UUID.macFrameworksBuildPhase} /* Frameworks */,
\t\t\t\t${UUID.macResourcesBuildPhase} /* Resources */,
\t\t\t\t${UUID.macCopyDistBuildPhase} /* Copy Web Bundle */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = "${appName}-macOS";
\t\t\tproductName = "${appName}";
\t\t\tproductReference = ${UUID.macAppProduct} /* ${appName}.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t};`
    : ""
}
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
${iosResourcePhaseFiles}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
${
  hasMacos
    ? `\t\t${UUID.macResourcesBuildPhase} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${macosResourcePhaseFiles}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};`
    : ""
}
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
\t\t\tshellScript = "${copyIosDistScript}";
\t\t};
${
  hasMacos
    ? `\t\t${UUID.macCopyDistBuildPhase} /* Copy Web Bundle */ = {
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
\t\t\tshellScript = "${copyMacosDistScript}";
\t\t};`
    : ""
}
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
${
  hasMacos
    ? `\t\t${UUID.macSourcesBuildPhase} /* Sources */ = {
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${macSourcesPhaseFiles}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};`
    : ""
}
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
\t\t${UUID.targetDebugConfig} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCURRENT_PROJECT_VERSION = ${iosBuildNumber};${iosDevTeamSetting}
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = ${appName}/Info.plist;${iosTargetSdkSettings}
\t\t\t\tMARKETING_VERSION = ${iosMarketingVersion};
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${iosAppId};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${UUID.targetReleaseConfig} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCURRENT_PROJECT_VERSION = ${iosBuildNumber};${iosDevTeamSetting}
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = ${appName}/Info.plist;${iosTargetSdkSettings}
\t\t\t\tMARKETING_VERSION = ${iosMarketingVersion};
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${iosAppId};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t};
\t\t\tname = Release;
\t\t};
${
  hasMacos
    ? `\t\t${UUID.macTargetDebugConfig} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCURRENT_PROJECT_VERSION = ${macosBuildNumber};${macosDevTeamSetting}
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = "${appName}/Info-macOS.plist";
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = ${macosDeploymentTarget};
\t\t\t\tMARKETING_VERSION = ${macosMarketingVersion};
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${macosAppId};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSUPPORTED_PLATFORMS = macosx;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${UUID.macTargetReleaseConfig} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCURRENT_PROJECT_VERSION = ${macosBuildNumber};${macosDevTeamSetting}
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = "${appName}/Info-macOS.plist";
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = ${macosDeploymentTarget};
\t\t\t\tMARKETING_VERSION = ${macosMarketingVersion};
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${macosAppId};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSUPPORTED_PLATFORMS = macosx;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t};
\t\t\tname = Release;
\t\t};`
    : ""
}
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
${
  hasMacos
    ? `\t\t${UUID.macTargetConfigList} /* Build configuration list for PBXNativeTarget "${appName}-macOS" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${UUID.macTargetDebugConfig} /* Debug */,
\t\t\t\t${UUID.macTargetReleaseConfig} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};`
    : ""
}
/* End XCConfigurationList section */
\t};
\trootObject = ${UUID.project} /* Project object */;
}
`;
}
