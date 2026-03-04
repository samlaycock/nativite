import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolvePlatformIndexHtml } from "../platform-extensions-plugin.ts";

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
