import { describe, expect, it } from "bun:test";

import { androidConfig } from "../../../__tests__/fixtures.ts";
import { androidManifestTemplate } from "../android-manifest.ts";

describe("androidManifestTemplate", () => {
  it("declares INTERNET permission", () => {
    const output = androidManifestTemplate(androidConfig);
    expect(output).toContain("android.permission.INTERNET");
  });

  it("configures a single exported activity", () => {
    const output = androidManifestTemplate(androidConfig);
    expect(output).toContain('android:name=".MainActivity"');
    expect(output).toContain('android:exported="true"');
  });

  it("sets MAIN/LAUNCHER intent filter", () => {
    const output = androidManifestTemplate(androidConfig);
    expect(output).toContain("android.intent.action.MAIN");
    expect(output).toContain("android.intent.category.LAUNCHER");
  });

  it("enables cleartext traffic for dev server", () => {
    const output = androidManifestTemplate(androidConfig);
    expect(output).toContain('android:usesCleartextTraffic="true"');
  });

  it("sanitizes app name for theme reference", () => {
    const output = androidManifestTemplate(androidConfig);
    expect(output).toContain("@style/Theme.TestApp");
  });
});
