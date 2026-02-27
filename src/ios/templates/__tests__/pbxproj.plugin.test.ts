import { describe, expect, it } from "bun:test";

import type { ResolvedNativitePlugins } from "../../../plugins/resolve.ts";

import { baseConfig } from "../../../__tests__/fixtures.ts";
import { NativiteConfigSchema, ios, macos } from "../../../index.ts";
import { pbxprojTemplate } from "../pbxproj.ts";

describe("pbxprojTemplate (plugins)", () => {
  it("includes plugin registrant, plugin source files, and framework dependencies", () => {
    const resolvedPlugins: ResolvedNativitePlugins = {
      plugins: [
        {
          name: "camera-plugin",
          rootDir: "/tmp/demo/vendor/camera",
          fingerprint: "abc123",
          platforms: {
            ios: {
              sources: [
                {
                  pluginName: "camera-plugin",
                  absolutePath: "/tmp/demo/native/ios/CameraPlugin.swift",
                },
              ],
              resources: [],
              registrars: ["registerCameraPlugin"],
              dependencies: [{ name: "AVFoundation", weak: false }],
            },
            macos: {
              sources: [],
              resources: [],
              registrars: [],
              dependencies: [],
            },
          },
        },
      ],
      platforms: {
        ios: {
          sources: [
            {
              pluginName: "camera-plugin",
              absolutePath: "/tmp/demo/native/ios/CameraPlugin.swift",
            },
          ],
          resources: [],
          registrars: ["registerCameraPlugin"],
          dependencies: [{ name: "AVFoundation", weak: false }],
        },
        macos: {
          sources: [],
          resources: [],
          registrars: [],
          dependencies: [],
        },
      },
    };

    const pbxproj = pbxprojTemplate(baseConfig, resolvedPlugins, "/tmp/demo/.nativite/ios");
    expect(pbxproj).toContain("NativitePluginRegistrant.swift");
    expect(pbxproj).toContain('path = "../../native/ios/CameraPlugin.swift"');
    expect(pbxproj).toContain("AVFoundation.framework");
  });

  it("applies per-platform root overrides to target bundle identifiers", () => {
    const config = NativiteConfigSchema.parse({
      app: {
        name: "TestApp",
        bundleId: "com.example.testapp",
        version: "1.0.0",
        buildNumber: 1,
      },
      platforms: [
        ios({
          minimumVersion: "17.0",
          overrides: { app: { bundleId: "com.example.testapp.ios" } },
        }),
        macos({
          minimumVersion: "14.0",
          overrides: { app: { bundleId: "com.example.testapp.macos" } },
        }),
      ],
    });

    const resolvedPlugins: ResolvedNativitePlugins = {
      plugins: [],
      platforms: {
        ios: { sources: [], resources: [], registrars: [], dependencies: [] },
        macos: { sources: [], resources: [], registrars: [], dependencies: [] },
      },
    };

    const pbxproj = pbxprojTemplate(config, resolvedPlugins, "/tmp/demo/.nativite/ios");
    expect(pbxproj).toContain("PRODUCT_BUNDLE_IDENTIFIER = com.example.testapp.ios;");
    expect(pbxproj).toContain("PRODUCT_BUNDLE_IDENTIFIER = com.example.testapp.macos;");
  });

  it("copies .nativite/dev.json into the app bundle during the copy phase", () => {
    const resolvedPlugins: ResolvedNativitePlugins = {
      plugins: [],
      platforms: {
        ios: { sources: [], resources: [], registrars: [], dependencies: [] },
        macos: { sources: [], resources: [], registrars: [], dependencies: [] },
      },
    };

    const pbxproj = pbxprojTemplate(baseConfig, resolvedPlugins, "/tmp/demo/.nativite/ios");
    expect(pbxproj).toContain('DEV_JSON_SRC=\\"$SRCROOT/../dev.json\\"');
    expect(pbxproj).toContain('DEV_JSON_DEST=\\"$CODESIGNING_FOLDER_PATH/dev.json\\"');
  });
});
