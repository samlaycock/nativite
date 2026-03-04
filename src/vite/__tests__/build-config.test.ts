import type { UserConfig } from "vite";

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { nativite } from "../index.ts";

function getCorePlugin() {
  const plugin = nativite().find((entry) => entry.name === "nativite");
  if (!plugin?.config || typeof plugin.config !== "function") {
    throw new Error("nativite core plugin config hook is missing");
  }
  return plugin;
}

async function runConfigHook(
  plugin: ReturnType<typeof getCorePlugin>,
  config: UserConfig,
  env: { command: "build" | "serve"; mode: string },
): Promise<Partial<UserConfig>> {
  const hook = plugin.config;
  if (!hook) {
    throw new Error("nativite core plugin config hook is missing");
  }

  const handler = typeof hook === "function" ? hook : hook.handler;
  const invoke = handler as unknown as (
    cfg: UserConfig,
    cfgEnv: { command: "build" | "serve"; mode: string },
  ) => Partial<UserConfig> | null | void | Promise<Partial<UserConfig> | null | void>;
  const result = await invoke(config, env);
  return result ?? {};
}

function getEnvironmentDefine(
  config: Partial<UserConfig>,
  environment: string,
): Record<string, string> {
  const environments = config.environments as
    | Record<string, { define?: Record<string, string> }>
    | undefined;
  const define = environments?.[environment]?.define;
  if (!define) {
    throw new Error(`missing define object for environment "${environment}"`);
  }
  return define;
}

const ORIGINAL_NATIVITE_PLATFORM = process.env["NATIVITE_PLATFORM"];
const ORIGINAL_NATIVITE_PLATFORM_METADATA = process.env["NATIVITE_PLATFORM_METADATA"];
const ORIGINAL_NATIVITE_DEV_ERROR_OVERLAY = process.env["NATIVITE_DEV_ERROR_OVERLAY"];

afterEach(() => {
  if (ORIGINAL_NATIVITE_PLATFORM === undefined) {
    delete process.env["NATIVITE_PLATFORM"];
  } else {
    process.env["NATIVITE_PLATFORM"] = ORIGINAL_NATIVITE_PLATFORM;
  }

  if (ORIGINAL_NATIVITE_PLATFORM_METADATA === undefined) {
    delete process.env["NATIVITE_PLATFORM_METADATA"];
  } else {
    process.env["NATIVITE_PLATFORM_METADATA"] = ORIGINAL_NATIVITE_PLATFORM_METADATA;
  }

  if (ORIGINAL_NATIVITE_DEV_ERROR_OVERLAY === undefined) {
    delete process.env["NATIVITE_DEV_ERROR_OVERLAY"];
  } else {
    process.env["NATIVITE_DEV_ERROR_OVERLAY"] = ORIGINAL_NATIVITE_DEV_ERROR_OVERLAY;
  }
});

describe("nativite core build config", () => {
  it("uses a relative base for native builds so file:// bundles can resolve assets", async () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const plugin = getCorePlugin();
    const config = await runConfigHook(plugin, {}, { command: "build", mode: "production" });

    expect(config.base).toBe("./");
  });

  it("does not force a base value during dev server runs", async () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const plugin = getCorePlugin();
    const config = await runConfigHook(plugin, {}, { command: "serve", mode: "development" });

    expect(config.base).toBeUndefined();
  });

  it("enables the Vite HMR error overlay by default during dev server runs", async () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const plugin = getCorePlugin();
    const config = await runConfigHook(plugin, {}, { command: "serve", mode: "development" });
    const hmr = config.server?.hmr as { overlay?: boolean } | undefined;

    expect(config.server).toBeObject();
    expect(hmr).toBeObject();
    expect(hmr?.overlay).toBe(true);
  });

  it("disables the Vite HMR error overlay when NATIVITE_DEV_ERROR_OVERLAY is false", async () => {
    process.env["NATIVITE_PLATFORM"] = "ios";
    process.env["NATIVITE_DEV_ERROR_OVERLAY"] = "false";

    const plugin = getCorePlugin();
    const config = await runConfigHook(plugin, {}, { command: "serve", mode: "development" });
    const hmr = config.server?.hmr as { overlay?: boolean } | undefined;

    expect(config.server).toBeObject();
    expect(hmr).toBeObject();
    expect(hmr?.overlay).toBe(false);
  });

  it("derives Vite HMR overlay default from ios.errorOverlay config", async () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const projectRoot = mkdtempSync(join(tmpdir(), "nativite-vite-config-"));
    try {
      writeFileSync(
        join(projectRoot, "nativite.config.ts"),
        `export default {
  app: {
    name: "OverlayApp",
    bundleId: "com.example.overlayapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [{ platform: "ios", minimumVersion: "17.0", errorOverlay: false }],
};
`,
      );

      const plugin = getCorePlugin();
      const config = await runConfigHook(
        plugin,
        { root: projectRoot },
        { command: "serve", mode: "development" },
      );
      const hmr = config.server?.hmr as { overlay?: boolean } | undefined;

      expect(config.server).toBeObject();
      expect(hmr).toBeObject();
      expect(hmr?.overlay).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("nativite core native html entry", () => {
  it("uses the highest-priority platform html entry for native builds", async () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const projectRoot = mkdtempSync(join(tmpdir(), "nativite-vite-html-entry-"));
    try {
      writeFileSync(join(projectRoot, "index.html"), "<html><body>web</body></html>");
      writeFileSync(join(projectRoot, "index.native.html"), "<html><body>native</body></html>");
      writeFileSync(join(projectRoot, "index.ios.html"), "<html><body>ios</body></html>");

      const plugin = getCorePlugin();
      const config = await runConfigHook(
        plugin,
        { root: projectRoot },
        { command: "build", mode: "production" },
      );
      const input = config.build?.rollupOptions?.input;

      expect(input).toEqual({
        index: join(projectRoot, "index.ios.html"),
      });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not override an explicit user rollup input", async () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const projectRoot = mkdtempSync(join(tmpdir(), "nativite-vite-html-entry-user-input-"));
    try {
      writeFileSync(join(projectRoot, "index.html"), "<html><body>web</body></html>");
      writeFileSync(join(projectRoot, "index.native.html"), "<html><body>native</body></html>");

      const plugin = getCorePlugin();
      const config = await runConfigHook(
        plugin,
        {
          root: projectRoot,
          build: {
            rollupOptions: {
              input: join(projectRoot, "custom-entry.html"),
            },
          },
        },
        { command: "build", mode: "production" },
      );

      expect(config.build?.rollupOptions).toBeUndefined();
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("nativite core platform globals", () => {
  it("defines mobile and desktop globals for built-in native environments", async () => {
    const plugin = getCorePlugin();
    const config = await runConfigHook(plugin, {}, { command: "serve", mode: "development" });

    const iosDefine = getEnvironmentDefine(config, "ios");
    expect(iosDefine["__IS_NATIVE__"]).toBe("true");
    expect(iosDefine["__IS_MOBILE__"]).toBe("true");
    expect(iosDefine["__IS_DESKTOP__"]).toBe("false");

    const androidDefine = getEnvironmentDefine(config, "android");
    expect(androidDefine["__IS_NATIVE__"]).toBe("true");
    expect(androidDefine["__IS_MOBILE__"]).toBe("true");
    expect(androidDefine["__IS_DESKTOP__"]).toBe("false");

    const macosDefine = getEnvironmentDefine(config, "macos");
    expect(macosDefine["__IS_NATIVE__"]).toBe("true");
    expect(macosDefine["__IS_MOBILE__"]).toBe("false");
    expect(macosDefine["__IS_DESKTOP__"]).toBe("true");
  });

  it("uses serialized platform plugin traits when building custom desktop targets", async () => {
    const plugin = getCorePlugin();

    process.env["NATIVITE_PLATFORM_METADATA"] = JSON.stringify({
      windows: {
        extensions: [".windows", ".desktop", ".native"],
        environments: ["windows"],
        bundlePlatform: "windows",
        native: true,
        mobile: false,
        desktop: true,
      },
      linux: {
        extensions: [".linux", ".desktop", ".native"],
        environments: ["linux"],
        bundlePlatform: "linux",
        native: true,
        mobile: false,
        desktop: true,
      },
    });

    process.env["NATIVITE_PLATFORM"] = "windows";
    const windowsConfig = await runConfigHook(plugin, {}, { command: "build", mode: "production" });
    const windowsDefine = getEnvironmentDefine(windowsConfig, "windows");
    expect(windowsDefine["__IS_NATIVE__"]).toBe("true");
    expect(windowsDefine["__IS_MOBILE__"]).toBe("false");
    expect(windowsDefine["__IS_DESKTOP__"]).toBe("true");

    process.env["NATIVITE_PLATFORM"] = "linux";
    const linuxConfig = await runConfigHook(plugin, {}, { command: "build", mode: "production" });
    const linuxDefine = getEnvironmentDefine(linuxConfig, "linux");
    expect(linuxDefine["__IS_NATIVE__"]).toBe("true");
    expect(linuxDefine["__IS_MOBILE__"]).toBe("false");
    expect(linuxDefine["__IS_DESKTOP__"]).toBe("true");
  });

  it("maps custom environment traits from serialized platform metadata", async () => {
    const plugin = getCorePlugin();
    process.env["NATIVITE_PLATFORM_METADATA"] = JSON.stringify({
      satellite: {
        extensions: [".satellite", ".native"],
        environments: ["satellite-phone", "satellite-desktop"],
        bundlePlatform: "satellite",
        native: true,
        mobile: true,
        desktop: false,
      },
      headless: {
        extensions: [".headless", ".native"],
        environments: ["headless"],
        bundlePlatform: "headless",
        native: false,
        mobile: false,
        desktop: false,
      },
      minimal: {
        extensions: [".minimal", ".native"],
        environments: ["minimal"],
        bundlePlatform: "minimal",
      },
    });

    const config = await runConfigHook(plugin, {}, { command: "serve", mode: "development" });
    const satelliteDefine = getEnvironmentDefine(config, "satellite-phone");
    expect(satelliteDefine["__IS_NATIVE__"]).toBe("true");
    expect(satelliteDefine["__IS_MOBILE__"]).toBe("true");
    expect(satelliteDefine["__IS_DESKTOP__"]).toBe("false");

    const headlessDefine = getEnvironmentDefine(config, "headless");
    expect(headlessDefine["__IS_NATIVE__"]).toBe("false");
    expect(headlessDefine["__IS_MOBILE__"]).toBe("false");
    expect(headlessDefine["__IS_DESKTOP__"]).toBe("false");

    const minimalDefine = getEnvironmentDefine(config, "minimal");
    expect(minimalDefine["__IS_NATIVE__"]).toBe("true");
    expect(minimalDefine["__IS_MOBILE__"]).toBe("false");
    expect(minimalDefine["__IS_DESKTOP__"]).toBe("false");
  });

  it("defaults global native/mobile/desktop flags to false for web", async () => {
    const plugin = getCorePlugin();
    const config = await runConfigHook(plugin, {}, { command: "build", mode: "production" });

    expect(config.define).toMatchObject({
      __IS_NATIVE__: "false",
      __IS_MOBILE__: "false",
      __IS_DESKTOP__: "false",
    });
  });
});

describe("nativite dev error overlay plugin", () => {
  it("registers the dev error overlay sub-plugin", () => {
    const plugins = nativite();
    const overlayPlugin = plugins.find((entry) => entry.name === "nativite:dev-error-overlay");

    expect(overlayPlugin).toBeDefined();
    expect(overlayPlugin!.apply).toBe("serve");
  });

  it("injects chrome-aware CSS for vite-error-overlay via transformIndexHtml", () => {
    const plugins = nativite();
    const overlayPlugin = plugins.find((entry) => entry.name === "nativite:dev-error-overlay");
    const hook = overlayPlugin!.transformIndexHtml;

    expect(hook).toBeFunction();

    const result = (hook as () => unknown[])();

    expect(result).toBeArrayOfSize(1);
    expect(result[0]).toMatchObject({
      tag: "style",
      injectTo: "head",
    });

    const children = (result[0] as { children: string }).children;
    expect(children).toContain("vite-error-overlay");
    expect(children).toContain("--nv-inset-top");
    expect(children).toContain("--nv-inset-bottom");
  });
});
