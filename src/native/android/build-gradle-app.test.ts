import { describe, expect, it } from "bun:test";

import { androidConfig } from "../../../test/fixtures.ts";
import { buildGradleAppTemplate } from "./build-gradle-app.ts";

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

  it("copies the Android production web bundle into generated assets for release builds", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);

    expect(output).toContain(
      'val nativiteWebBundleDir = rootProject.layout.projectDirectory.dir("../../dist-android")',
    );
    expect(output).toContain(
      'val nativiteGeneratedAssetsDir = layout.buildDirectory.dir("generated/nativite/assets")',
    );
    expect(output).toContain("val copyNativiteWebBundle by tasks.registering(Copy::class)");
    expect(output).toContain("from(nativiteWebBundleDir)");
    expect(output).toContain('into(nativiteGeneratedAssetsDir.map { it.dir("dist") })');
    expect(output).toContain("assets.srcDir(nativiteGeneratedAssetsDir)");
  });

  it("fails release asset merging clearly when the Android web bundle is missing", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);

    expect(output).toContain(
      'throw GradleException("Missing Android web bundle at ${bundlePath.path}. Run `bunx nativite build --platform android` before building release.")',
    );
    expect(output).toContain('if (name == "mergeReleaseAssets")');
    expect(output).toContain("dependsOn(copyNativiteWebBundle)");
  });

  it("removes stale dev metadata before release assets are merged", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35);

    expect(output).toContain(
      'val nativiteDevMetadataFile = layout.projectDirectory.file("src/main/assets/dev.json")',
    );
    expect(output).toContain("val deleteNativiteDevMetadata by tasks.registering(Delete::class)");
    expect(output).toContain("delete(nativiteDevMetadataFile)");
    expect(output).toContain("dependsOn(deleteNativiteDevMetadata)");
  });

  it("includes Android plugin source dirs, resource dirs, and Gradle dependencies", () => {
    const output = buildGradleAppTemplate(androidConfig, 26, 35, {
      sourceDirs: ["/tmp/plugin/java"],
      resourceDirs: ["/tmp/plugin/res"],
      dependencies: [
        {
          kind: "gradle",
          notation: "androidx.camera:camera-core:1.4.0",
          configuration: "implementation",
        },
      ],
    });

    expect(output).toContain('java.srcDirs("/tmp/plugin/java")');
    expect(output).toContain('res.srcDirs("/tmp/plugin/res")');
    expect(output).toContain('add("implementation", "androidx.camera:camera-core:1.4.0")');
  });
});
