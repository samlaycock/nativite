import { describe, expect, it } from "bun:test";

import { versionCatalogTemplate } from "./version-catalog.ts";

describe("versionCatalogTemplate", () => {
  it("omits QuickJS entries when background tasks are not configured", () => {
    const output = versionCatalogTemplate();

    expect(output).not.toContain("quickjsKt");
    expect(output).not.toContain("quickjs-kt-android");
    expect(output).not.toContain("workRuntimeKtx");
    expect(output).not.toContain("androidx-work-runtime-ktx");
  });

  it("includes background runtime entries when background tasks are configured", () => {
    const output = versionCatalogTemplate({ includeQuickJs: true, includeWorkManager: true });

    expect(output).toContain('quickjsKt = "1.0.5"');
    expect(output).toContain('quickjs-kt-android = { group = "io.github.dokar3"');
    expect(output).toContain('workRuntimeKtx = "2.10.5"');
    expect(output).toContain('androidx-work-runtime-ktx = { group = "androidx.work"');
  });
});
