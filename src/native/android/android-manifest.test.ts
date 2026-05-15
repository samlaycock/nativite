import { describe, expect, it } from "bun:test";

import { androidConfig } from "../../../test/fixtures.ts";
import { androidManifestTemplate } from "./android-manifest.ts";

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

  it("declares only read contacts permission when the first-party contacts plugin is configured", () => {
    const output = androidManifestTemplate({
      ...androidConfig,
      plugins: [{ name: "nativite-contacts" }],
    });

    expect(output).toContain("android.permission.READ_CONTACTS");
    expect(output).not.toContain("android.permission.WRITE_CONTACTS");
    expect(output).not.toContain("android.permission.GET_ACCOUNTS");
  });

  it("declares calendar permissions when the first-party calendar plugin is configured", () => {
    const output = androidManifestTemplate({
      ...androidConfig,
      plugins: [{ name: "nativite-calendar" }],
    });

    expect(output).toContain("android.permission.READ_CALENDAR");
    expect(output).toContain("android.permission.WRITE_CALENDAR");
  });

  it("declares post notifications permission when the first-party notifications plugin is configured", () => {
    const output = androidManifestTemplate({
      ...androidConfig,
      plugins: [{ name: "nativite-notifications" }],
    });

    expect(output).toContain("android.permission.POST_NOTIFICATIONS");
    expect(output).toContain("android.permission.SCHEDULE_EXACT_ALARM");
    expect(output).toContain("dev.nativite.plugins.notifications.NativiteNotificationReceiver");
    expect(output).toContain('android:exported="false"');
  });
});
