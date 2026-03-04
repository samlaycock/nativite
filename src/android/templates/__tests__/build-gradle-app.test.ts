import { describe, expect, it } from "bun:test";

import { androidConfig } from "../../../__tests__/fixtures.ts";
import { buildGradleAppTemplate } from "../build-gradle-app.ts";

describe("buildGradleAppTemplate", () => {
  it("sets applicationId from bundleId", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);
    expect(output).toContain('applicationId = "com.example.testapp"');
  });

  it("sets minSdk and targetSdk", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);
    expect(output).toContain("minSdk = 26");
    expect(output).toContain("targetSdk = 35");
  });

  it("sets versionCode and versionName from config", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);
    expect(output).toContain("versionCode = 1");
    expect(output).toContain('versionName = "1.0.0"');
  });

  it("includes Compose and WebKit dependencies", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);
    expect(output).toContain("libs.androidx.compose.material3");
    expect(output).toContain("libs.androidx.webkit");
    expect(output).toContain("libs.androidx.activity.compose");
  });

  it("enables Compose build feature", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);
    expect(output).toContain("compose = true");
  });

  it("enables BuildConfig generation", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);
    expect(output).toContain("buildConfig = true");
  });
});
