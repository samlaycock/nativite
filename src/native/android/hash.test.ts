import { describe, expect, it } from "bun:test";

import type { ResolvedNativitePlugins } from "../../plugins/resolve.ts";

import { androidConfig } from "../../../test/fixtures.ts";
import { hashConfigForGeneration } from "./hash.ts";

const emptyResolvedPlugins: ResolvedNativitePlugins = {
  plugins: [],
  platforms: {
    ios: { sources: [], resources: [], registrars: [], dependencies: [] },
    macos: { sources: [], resources: [], registrars: [], dependencies: [] },
    android: { sources: [], resources: [], registrars: [], dependencies: [] },
  },
};

describe("hashConfigForGeneration", () => {
  it("includes generated template inputs in the generation hash", () => {
    const first = hashConfigForGeneration(androidConfig, emptyResolvedPlugins, [
      { name: "Runtime.kt", content: "val value = 1" },
    ]);
    const second = hashConfigForGeneration(androidConfig, emptyResolvedPlugins, [
      { name: "Runtime.kt", content: "val value = 2" },
    ]);

    expect(first).not.toBe(second);
  });
});
