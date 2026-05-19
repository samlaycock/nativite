import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const pkg = _require("../package.json") as {
  exports?: Record<string, PackageExportTarget>;
};

interface PackageExportTarget {
  readonly import?: string;
  readonly types?: string;
  readonly require?: string;
}

const publicEntrypoints = [
  [".", "./dist/index.d.ts", "./dist/index.mjs"],
  ["./vite", "./dist/vite/index.d.ts", "./dist/vite/index.mjs"],
  ["./client", "./dist/client/index.d.ts", "./dist/client/index.mjs"],
  ["./utils", "./dist/utils.d.ts", "./dist/utils.mjs"],
  ["./chrome", "./dist/chrome/public.d.ts", "./dist/chrome/public.mjs"],
  ["./css", "./dist/css-vars/index.d.ts", "./dist/css-vars/index.mjs"],
  ["./background", "./dist/background.d.ts", "./dist/background.mjs"],
  ["./test", "./dist/test/index.d.ts", "./dist/test/index.mjs"],
  [
    "./vitest-browser-provider",
    "./dist/vitest-browser-provider/index.d.ts",
    "./dist/vitest-browser-provider/index.mjs",
  ],
  ["./plugins/contacts", "./dist/plugins/contacts/index.d.ts", "./dist/plugins/contacts/index.mjs"],
  ["./plugins/calendar", "./dist/plugins/calendar/index.d.ts", "./dist/plugins/calendar/index.mjs"],
  [
    "./plugins/notifications",
    "./dist/plugins/notifications/index.d.ts",
    "./dist/plugins/notifications/index.mjs",
  ],
  [
    "./plugins/secure-store",
    "./dist/plugins/secure-store/index.d.ts",
    "./dist/plugins/secure-store/index.mjs",
  ],
  [
    "./plugins/local-auth",
    "./dist/plugins/local-auth/index.d.ts",
    "./dist/plugins/local-auth/index.mjs",
  ],
  [
    "./plugins/system-controls",
    "./dist/plugins/system-controls/index.d.ts",
    "./dist/plugins/system-controls/index.mjs",
  ],
  ["./plugins/haptics", "./dist/plugins/haptics/index.d.ts", "./dist/plugins/haptics/index.mjs"],
  [
    "./plugins/app-integrity",
    "./dist/plugins/app-integrity/index.d.ts",
    "./dist/plugins/app-integrity/index.mjs",
  ],
  [
    "./plugins/capture-protection",
    "./dist/plugins/capture-protection/index.d.ts",
    "./dist/plugins/capture-protection/index.mjs",
  ],
] as const;

describe("package exports", () => {
  it("treats package exports as the complete public module list", () => {
    expect(Object.keys(pkg.exports ?? {})).toEqual([
      ...publicEntrypoints.map(([subpath]) => subpath),
      "./globals",
    ]);
  });

  it("pins the 1.0 public JavaScript subpath import and type targets", () => {
    for (const [subpath, types, importTarget] of publicEntrypoints) {
      expect(pkg.exports?.[subpath]).toEqual({ types, import: importTarget });
    }
  });

  it("keeps globals as a types-only public subpath", () => {
    expect(pkg.exports?.["./globals"]).toEqual({ types: "./dist/globals.d.ts" });
  });

  it("exports the css subpath", () => {
    expect(pkg.exports?.["./css"]).toBeDefined();
  });

  it("exports the test subpath", () => {
    expect(pkg.exports?.["./test"]).toBeDefined();
  });

  it("exports the Vitest browser provider subpath", () => {
    expect(pkg.exports?.["./vitest-browser-provider"]).toBeDefined();
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
