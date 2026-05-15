import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const pkg = _require("../package.json") as { exports?: Record<string, unknown> };

describe("package exports", () => {
  it("treats package exports as the complete public module list", () => {
    expect(Object.keys(pkg.exports ?? {})).toEqual([
      ".",
      "./vite",
      "./client",
      "./utils",
      "./chrome",
      "./css",
      "./background",
      "./plugins/contacts",
      "./plugins/calendar",
      "./plugins/notifications",
      "./plugins/secure-store",
      "./globals",
    ]);
  });

  it("exports the css subpath", () => {
    expect(pkg.exports?.["./css"]).toBeDefined();
  });

  it("does not export the css-vars subpath", () => {
    expect(pkg.exports?.["./css-vars"]).toBeUndefined();
  });

  it("does not expose CommonJS require conditions", () => {
    for (const value of Object.values(pkg.exports ?? {})) {
      expect(value).not.toHaveProperty("require");
    }
  });

  it("keeps the cli binary-only", () => {
    expect(pkg.exports?.["./cli"]).toBeUndefined();
  });
});
