import { describe, expect, it } from "bun:test";

import {
  baseConfig,
  dualPlatformConfig,
  macosConfig,
  otaConfig,
  signedConfig,
  splashColorConfig,
} from "../../../__tests__/fixtures.ts";
import { infoPlistMacOSTemplate, infoPlistTemplate } from "../info-plist.ts";

describe("infoPlistTemplate", () => {
  // ── XML structure ────────────────────────────────────────────────────────────

  it("starts with a valid XML declaration", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output.trimStart()).toStartWith('<?xml version="1.0"');
  });

  it("includes the Apple plist DOCTYPE", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("apple.com/DTDs/PropertyList-1.0.dtd");
  });

  it("opens and closes a root <dict>", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("<dict>");
    expect(output).toContain("</dict>");
    expect(output).toContain("</plist>");
  });

  // ── App identity keys ────────────────────────────────────────────────────────

  it("embeds the app bundleId", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("<string>com.example.testapp</string>");
  });

  it("embeds the app name in CFBundleName", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("<string>TestApp</string>");
  });

  it("uses MARKETING_VERSION build setting for version", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("<string>$(MARKETING_VERSION)</string>");
  });

  it("uses CURRENT_PROJECT_VERSION for build number", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("<string>$(CURRENT_PROJECT_VERSION)</string>");
  });

  it("sets LSRequiresIPhoneOS to true", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("<key>LSRequiresIPhoneOS</key>");
    // The <true/> follows the key
    const idx = output.indexOf("<key>LSRequiresIPhoneOS</key>");
    expect(output.slice(idx)).toMatch(/LSRequiresIPhoneOS<\/key>\s*<true\/>/);
  });

  // ── Launch screen ────────────────────────────────────────────────────────────

  it("uses bare UILaunchScreen dict when no splash config is set", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("<key>UILaunchScreen</key>");
    expect(output).toContain("<dict/>");
    expect(output).not.toContain("UILaunchStoryboardName");
  });

  it("uses UILaunchStoryboardName when splash is configured", () => {
    const output = infoPlistTemplate(splashColorConfig);
    expect(output).toContain("<key>UILaunchStoryboardName</key>");
    expect(output).toContain("<string>LaunchScreen</string>");
    expect(output).not.toContain("<key>UILaunchScreen</key>");
  });

  it("references the storyboard by the name 'LaunchScreen'", () => {
    const output = infoPlistTemplate(splashColorConfig);
    const storyboardIdx = output.indexOf("UILaunchStoryboardName");
    const snippet = output.slice(storyboardIdx, storyboardIdx + 100);
    expect(snippet).toContain("LaunchScreen");
  });

  // ── Supported orientations ───────────────────────────────────────────────────

  it("includes portrait orientation", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("UIInterfaceOrientationPortrait");
  });

  it("includes landscape-left orientation", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("UIInterfaceOrientationLandscapeLeft");
  });

  it("includes landscape-right orientation", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("UIInterfaceOrientationLandscapeRight");
  });

  // ── ATS ──────────────────────────────────────────────────────────────────────

  it("includes NSAppTransportSecurity with NSAllowsLocalNetworking", () => {
    const output = infoPlistTemplate(baseConfig);
    expect(output).toContain("<key>NSAppTransportSecurity</key>");
    expect(output).toContain("<key>NSAllowsLocalNetworking</key>");
    expect(output).toContain("<true/>");
  });

  // ── Config variations don't affect Info.plist content (only splash matters) ──

  it("produces the same launch screen section regardless of OTA config", () => {
    const base = infoPlistTemplate(baseConfig);
    const withOta = infoPlistTemplate(otaConfig);
    // Both should use bare UILaunchScreen — OTA has no effect on Info.plist
    expect(base).toContain("<key>UILaunchScreen</key>");
    expect(withOta).toContain("<key>UILaunchScreen</key>");
  });

  it("produces the same launch screen section regardless of signing config", () => {
    const withSigning = infoPlistTemplate(signedConfig);
    expect(withSigning).toContain("<key>UILaunchScreen</key>");
  });

  // ── Snapshots ────────────────────────────────────────────────────────────────

  it("matches snapshot without splash", () => {
    expect(infoPlistTemplate(baseConfig)).toMatchSnapshot();
  });

  it("matches snapshot with splash", () => {
    expect(infoPlistTemplate(splashColorConfig)).toMatchSnapshot();
  });
});

describe("infoPlistMacOSTemplate", () => {
  // ── XML structure ────────────────────────────────────────────────────────────

  it("starts with a valid XML declaration", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output.trimStart()).toStartWith('<?xml version="1.0"');
  });

  it("includes the Apple plist DOCTYPE", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).toContain("apple.com/DTDs/PropertyList-1.0.dtd");
  });

  // ── macOS-specific keys ────────────────────────────────────────────────────

  it("includes LSMinimumSystemVersion", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).toContain("<key>LSMinimumSystemVersion</key>");
    expect(output).toContain("<string>$(MACOSX_DEPLOYMENT_TARGET)</string>");
  });

  it("sets NSPrincipalClass to NSApplication", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).toContain("<key>NSPrincipalClass</key>");
    expect(output).toContain("<string>NSApplication</string>");
  });

  it("sets NSHighResolutionCapable to true", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).toContain("<key>NSHighResolutionCapable</key>");
  });

  it("embeds the app bundleId", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).toContain("<string>com.example.testapp</string>");
  });

  it("embeds the app name", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).toContain("<string>TestApp</string>");
  });

  // ── Must NOT include iOS-only keys ────────────────────────────────────────

  it("does not include LSRequiresIPhoneOS", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).not.toContain("LSRequiresIPhoneOS");
  });

  it("does not include UILaunchScreen", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).not.toContain("UILaunchScreen");
  });

  it("does not include UISupportedInterfaceOrientations", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).not.toContain("UISupportedInterfaceOrientations");
  });

  // ── ATS ──────────────────────────────────────────────────────────────────────

  it("includes NSAppTransportSecurity with NSAllowsLocalNetworking", () => {
    const output = infoPlistMacOSTemplate(macosConfig);
    expect(output).toContain("<key>NSAppTransportSecurity</key>");
    expect(output).toContain("<key>NSAllowsLocalNetworking</key>");
  });

  // ── Works with dual platform config ────────────────────────────────────────

  it("produces valid output with a dual-platform config", () => {
    const output = infoPlistMacOSTemplate(dualPlatformConfig);
    expect(output).toContain("<key>LSMinimumSystemVersion</key>");
    expect(output).not.toContain("LSRequiresIPhoneOS");
  });

  // ── Snapshots ──────────────────────────────────────────────────────────────

  it("matches snapshot", () => {
    expect(infoPlistMacOSTemplate(macosConfig)).toMatchSnapshot();
  });
});
