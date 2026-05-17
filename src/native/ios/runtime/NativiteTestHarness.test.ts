import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "NativiteTestHarness.swift")).text();

describe("NativiteTestHarness.swift", () => {
  it("does not fall back to the app version for appId", () => {
    expect(swift).toContain('"appId": Bundle.main.bundleIdentifier ?? ""');
    expect(swift).not.toContain(
      '"appId": Bundle.main.bundleIdentifier ?? NativiteConfig.appVersion',
    );
  });
});
