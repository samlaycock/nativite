import { describe, expect, it } from "bun:test";

import * as viteApi from "../index.ts";

describe("nativite/vite public exports", () => {
  it("exports the nativite plugin factory", () => {
    expect(typeof viteApi.nativite).toBe("function");
  });

  it("does not export defineConfig", () => {
    const api = viteApi as Record<string, unknown>;
    expect(api["defineConfig"]).toBeUndefined();
  });

  it("does not export platformExtensionsPlugin", () => {
    const api = viteApi as Record<string, unknown>;
    expect(api["platformExtensionsPlugin"]).toBeUndefined();
  });
});
