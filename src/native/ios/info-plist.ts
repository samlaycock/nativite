import type { BackgroundTaskManifest } from "../../background.ts";
import type { NativiteConfig } from "../../index.ts";

function isSupportedIOSBackgroundTask(task: BackgroundTaskManifest["tasks"][number]): boolean {
  const ios = task.platforms.ios;
  return Boolean(
    ios && typeof ios === "object" && (ios as { kind?: unknown }).kind === "app-refresh",
  );
}

export function infoPlistMacOSTemplate(config: NativiteConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>${config.app.bundleId}</string>
  <key>CFBundleName</key>
  <string>${config.app.name}</string>
  <key>CFBundleDisplayName</key>
  <string>${config.app.name}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>LSMinimumSystemVersion</key>
  <string>$(MACOSX_DEPLOYMENT_TARGET)</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
`;
}

export function infoPlistTemplate(
  config: NativiteConfig,
  backgroundTaskManifest?: BackgroundTaskManifest,
): string {
  // When a splash config is present we use a LaunchScreen storyboard, which
  // requires UILaunchStoryboardName. Without one we fall back to the bare
  // UILaunchScreen dict (system default white screen).
  const launchScreenXml = config.splash
    ? `<key>UILaunchStoryboardName</key>\n  <string>LaunchScreen</string>`
    : `<key>UILaunchScreen</key>\n  <dict/>`;
  const backgroundTaskIdentifiers = [
    ...new Set(
      backgroundTaskManifest?.tasks.filter(isSupportedIOSBackgroundTask).map((task) => task.id) ??
        [],
    ),
  ].sort();
  const backgroundTasksXml =
    backgroundTaskIdentifiers.length > 0
      ? `
  <key>BGTaskSchedulerPermittedIdentifiers</key>
  <array>
${backgroundTaskIdentifiers.map((id) => `    <string>${id}</string>`).join("\n")}
  </array>
  <key>UIBackgroundModes</key>
  <array>
    <string>fetch</string>
  </array>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>${config.app.bundleId}</string>
  <key>CFBundleName</key>
  <string>${config.app.name}</string>
  <key>CFBundleDisplayName</key>
  <string>${config.app.name}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>LSRequiresIPhoneOS</key>
  <true/>
  ${launchScreenXml}${backgroundTasksXml}
  <key>UISupportedInterfaceOrientations</key>
  <array>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
  </array>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
`;
}
