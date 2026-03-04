import type { UserConfig } from "vite";

import { afterEach, describe, expect, it } from "bun:test";

import { nativite } from "../index.ts";

function getCorePlugin() {
  const plugin = nativite().find((entry) => entry.name === "nativite");
  if (!plugin?.config || typeof plugin.config !== "function") {
    throw new Error("nativite core plugin config hook is missing");
  }
  return plugin;
}

function runConfigHook(
  plugin: ReturnType<typeof getCorePlugin>,
  config: UserConfig,
  env: { command: "build" | "serve"; mode: string },
): Partial<UserConfig> {
  const hook = plugin.config;
  if (!hook) {
    throw new Error("nativite core plugin config hook is missing");
  }

  const handler = typeof hook === "function" ? hook : hook.handler;
  const invoke = handler as unknown as (
    cfg: UserConfig,
    cfgEnv: { command: "build" | "serve"; mode: string },
  ) => Partial<UserConfig> | null | void | Promise<Partial<UserConfig> | null | void>;
  const result = invoke(config, env);
  if (result instanceof Promise) {
    throw new Error("config hook returned a promise unexpectedly");
  }
  return result ?? {};
}

const ORIGINAL_NATIVITE_PLATFORM = process.env["NATIVITE_PLATFORM"];
const ORIGINAL_NATIVITE_DEV_ERROR_OVERLAY = process.env["NATIVITE_DEV_ERROR_OVERLAY"];

afterEach(() => {
  if (ORIGINAL_NATIVITE_PLATFORM === undefined) {
    delete process.env["NATIVITE_PLATFORM"];
  } else {
    process.env["NATIVITE_PLATFORM"] = ORIGINAL_NATIVITE_PLATFORM;
  }

  if (ORIGINAL_NATIVITE_DEV_ERROR_OVERLAY === undefined) {
    delete process.env["NATIVITE_DEV_ERROR_OVERLAY"];
  } else {
    process.env["NATIVITE_DEV_ERROR_OVERLAY"] = ORIGINAL_NATIVITE_DEV_ERROR_OVERLAY;
  }
});

describe("nativite core build config", () => {
  it("uses a relative base for native builds so file:// bundles can resolve assets", () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const plugin = getCorePlugin();
    const config = runConfigHook(plugin, {}, { command: "build", mode: "production" });

    expect(config.base).toBe("./");
  });

  it("does not force a base value during dev server runs", () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const plugin = getCorePlugin();
    const config = runConfigHook(plugin, {}, { command: "serve", mode: "development" });

    expect(config.base).toBeUndefined();
  });

  it("enables the Vite HMR error overlay by default during dev server runs", () => {
    process.env["NATIVITE_PLATFORM"] = "ios";

    const plugin = getCorePlugin();
    const config = runConfigHook(plugin, {}, { command: "serve", mode: "development" });
    const hmr = config.server?.hmr as { overlay?: boolean } | undefined;

    expect(config.server).toBeObject();
    expect(hmr).toBeObject();
    expect(hmr?.overlay).toBe(true);
  });

  it("disables the Vite HMR error overlay when NATIVITE_DEV_ERROR_OVERLAY is false", () => {
    process.env["NATIVITE_PLATFORM"] = "ios";
    process.env["NATIVITE_DEV_ERROR_OVERLAY"] = "false";

    const plugin = getCorePlugin();
    const config = runConfigHook(plugin, {}, { command: "serve", mode: "development" });
    const hmr = config.server?.hmr as { overlay?: boolean } | undefined;

    expect(config.server).toBeObject();
    expect(hmr).toBeObject();
    expect(hmr?.overlay).toBe(false);
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
