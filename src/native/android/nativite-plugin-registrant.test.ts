import { describe, expect, it } from "bun:test";

import type { ResolvedNativitePlugins } from "../../plugins/resolve.ts";

import { nativitePluginRegistrantTemplate } from "./nativite-plugin-registrant.ts";

describe("nativitePluginRegistrantTemplate", () => {
  it("calls Android plugin registrars with the bridge", () => {
    const resolvedPlugins: ResolvedNativitePlugins = {
      plugins: [],
      platforms: {
        ios: { sources: [], resources: [], registrars: [], dependencies: [] },
        macos: { sources: [], resources: [], registrars: [], dependencies: [] },
        android: {
          sources: [],
          resources: [],
          registrars: [
            "com.example.camera.registerCameraPlugin",
            "com.example.location.registerLocationPlugin",
          ],
          dependencies: [],
        },
      },
    };

    const output = nativitePluginRegistrantTemplate(resolvedPlugins);

    expect(output).toContain("import com.example.camera.registerCameraPlugin");
    expect(output).toContain("import com.example.location.registerLocationPlugin");
    expect(output).toContain("fun registerNativitePlugins(bridge: NativiteBridge)");
    expect(output).toContain("registerCameraPlugin(bridge)");
    expect(output).toContain("registerLocationPlugin(bridge)");
  });

  it("does not import same-package Android plugin registrars", () => {
    const resolvedPlugins: ResolvedNativitePlugins = {
      plugins: [],
      platforms: {
        ios: { sources: [], resources: [], registrars: [], dependencies: [] },
        macos: { sources: [], resources: [], registrars: [], dependencies: [] },
        android: {
          sources: [],
          resources: [],
          registrars: ["registerCameraPlugin"],
          dependencies: [],
        },
      },
    };

    const output = nativitePluginRegistrantTemplate(resolvedPlugins);

    expect(output).not.toContain("import registerCameraPlugin");
    expect(output).toContain("registerCameraPlugin(bridge)");
  });
});
