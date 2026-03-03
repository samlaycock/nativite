import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const pkg = _require("../../package.json") as { exports?: Record<string, unknown> };

describe("package exports", () => {
  it("exports the css subpath", () => {
    expect(pkg.exports?.["./css"]).toBeDefined();
  });

  it("does not export the css-vars subpath", () => {
    expect(pkg.exports?.["./css-vars"]).toBeUndefined();
  });
});
