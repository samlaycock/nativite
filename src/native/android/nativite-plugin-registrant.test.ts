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
          registrars: ["registerCameraPlugin", "registerLocationPlugin"],
          dependencies: [],
        },
      },
    };

    const output = nativitePluginRegistrantTemplate(resolvedPlugins);

    expect(output).toContain("fun registerNativitePlugins(bridge: NativiteBridge)");
    expect(output).toContain("registerCameraPlugin(bridge)");
    expect(output).toContain("registerLocationPlugin(bridge)");
  });
});
