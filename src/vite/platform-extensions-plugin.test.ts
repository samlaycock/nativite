import type { Plugin, ViteDevServer } from "vite";

import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  platformExtensionsPlugin,
  resolvePlatformIndexHtml,
} from "./platform-extensions-plugin.ts";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createTempRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), name));
  tempRoots.push(root);
  return root;
}

async function resolveId(plugin: Plugin, source: string, importer: string): Promise<unknown> {
  if (typeof plugin.resolveId !== "function") {
    throw new Error("Expected plugin to expose resolveId hook");
  }

  return await plugin.resolveId.call(
    {
      environment: undefined,
    } as never,
    source,
    importer,
    {
      attributes: {},
      isEntry: false,
    },
  );
}

function configureWatcher(plugin: Plugin): EventEmitter {
  const watcher = new EventEmitter();
  if (typeof plugin.configureServer !== "function") {
    throw new Error("Expected plugin to expose configureServer hook");
  }

  const configureServer = plugin.configureServer;
  void configureServer.call(
    {} as never,
    {
      watcher,
    } as unknown as ViteDevServer,
  );
  return watcher;
}

describe("resolvePlatformIndexHtml", () => {
  it("prefers higher-priority platform suffixes before .native", () => {
    const root = createTempRoot("nativite-index-html-priority-");
    writeFileSync(join(root, "index.native.html"), "<html><body>native</body></html>");
    writeFileSync(join(root, "index.ios.html"), "<html><body>ios</body></html>");

    const resolved = resolvePlatformIndexHtml(root, "ios");

    expect(resolved?.fileName).toBe("index.ios.html");
  });

  it("respects custom suffix order when provided", () => {
    const root = createTempRoot("nativite-index-html-custom-");
    writeFileSync(join(root, "index.desktop.html"), "<html><body>desktop</body></html>");
    writeFileSync(join(root, "index.native.html"), "<html><body>native</body></html>");

    const resolved = resolvePlatformIndexHtml(root, "custom", [".desktop", ".native"]);

    expect(resolved?.fileName).toBe("index.desktop.html");
  });

  it("returns undefined when no platform html variant exists", () => {
    const root = createTempRoot("nativite-index-html-none-");
    writeFileSync(join(root, "index.html"), "<html><body>web</body></html>");

    const resolved = resolvePlatformIndexHtml(root, "ios");

    expect(resolved).toBeUndefined();
  });
});

describe("platformExtensionsPlugin", () => {
  it("caches resolution misses until a relevant watcher event invalidates them", async () => {
    const root = createTempRoot("nativite-platform-cache-miss-");
    mkdirSync(join(root, "src"));
    const importer = join(root, "src", "App.tsx");
    const platformFile = join(root, "src", "Button.ios.tsx");
    const plugin = platformExtensionsPlugin("ios");
    const watcher = configureWatcher(plugin);

    expect(await resolveId(plugin, "./Button", importer)).toBeNull();

    writeFileSync(platformFile, "export function Button() { return null; }");

    expect(await resolveId(plugin, "./Button", importer)).toBeNull();

    watcher.emit("add", platformFile);

    expect(await resolveId(plugin, "./Button", importer)).toBe(platformFile);
  });

  it("invalidates cached hits when a resolved platform file is unlinked", async () => {
    const root = createTempRoot("nativite-platform-cache-hit-");
    mkdirSync(join(root, "src"));
    const importer = join(root, "src", "App.tsx");
    const platformFile = join(root, "src", "Button.ios.tsx");
    writeFileSync(platformFile, "export function Button() { return null; }");

    const plugin = platformExtensionsPlugin("ios");
    const watcher = configureWatcher(plugin);

    expect(await resolveId(plugin, "./Button", importer)).toBe(platformFile);

    rmSync(platformFile);
    watcher.emit("unlink", platformFile);

    expect(await resolveId(plugin, "./Button", importer)).toBeNull();
  });

  it("keeps cached hits when a resolved platform file changes content", async () => {
    const root = createTempRoot("nativite-platform-cache-change-");
    mkdirSync(join(root, "src"));
    const importer = join(root, "src", "App.tsx");
    const platformFile = join(root, "src", "Button.ios.tsx");
    writeFileSync(platformFile, "export function Button() { return 'before'; }");

    const plugin = platformExtensionsPlugin("ios");
    const watcher = configureWatcher(plugin);

    expect(await resolveId(plugin, "./Button", importer)).toBe(platformFile);

    writeFileSync(platformFile, "export function Button() { return 'after'; }");
    watcher.emit("change", platformFile);
    rmSync(platformFile);

    expect(await resolveId(plugin, "./Button", importer)).toBe(platformFile);
  });
});
