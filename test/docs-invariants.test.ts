import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_ANDROID_MIN_SDK,
  DEFAULT_ANDROID_TARGET_SDK,
  DEFAULT_IOS_MINIMUM_VERSION,
  DEFAULT_MACOS_MINIMUM_VERSION,
} from "../src/index.ts";

const repositoryRoot = join(import.meta.dir, "..");

function readRepositoryFile(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

describe("documentation invariants", () => {
  it("keeps README platform defaults aligned with exported config defaults", () => {
    const readme = readRepositoryFile("README.md");

    expect(readme).toContain(`iOS \`${DEFAULT_IOS_MINIMUM_VERSION}\``);
    expect(readme).toContain(`macOS \`${DEFAULT_MACOS_MINIMUM_VERSION}\``);
    expect(readme).toContain(`Android \`minSdk\` \`${DEFAULT_ANDROID_MIN_SDK}\``);
    expect(readme).toContain(`Android \`targetSdk\` \`${DEFAULT_ANDROID_TARGET_SDK}\``);
  });

  it("keeps Android project docs aligned with exported SDK defaults", () => {
    const androidProjectGeneration = readRepositoryFile("docs/android/project-generation.md");

    expect(androidProjectGeneration).toContain(
      `| \`minSdk\`      | \`${DEFAULT_ANDROID_MIN_SDK}\``,
    );
    expect(androidProjectGeneration).toContain(
      `| \`targetSdk\`   | \`${DEFAULT_ANDROID_TARGET_SDK}\``,
    );
  });

  it("documents the 1.0 stability statement and current store upload requirements", () => {
    const readme = readRepositoryFile("README.md");
    const cliBuild = readRepositoryFile("docs/shared/cli-build.md");
    const quickstart = readRepositoryFile("docs/shared/quickstart.md");
    const releaseRequirements = readRepositoryFile("docs/shared/release-requirements.md");
    const packageExports = readRepositoryFile("docs/shared/package-exports.md");
    const pluginSystem = readRepositoryFile("docs/shared/plugin-system.md");
    const platformComparison = readRepositoryFile("docs/shared/platform-comparison.md");

    expect(readme).not.toContain("Status: early development");
    expect(readme).toContain("Nativite 1.0 defines a stable public configuration");
    expect(packageExports).toContain("supported 1.0 package");
    expect(pluginSystem).toContain("supported 1.0 extension-authoring contract");
    expect(platformComparison).toContain("1.0 platform support contract");
    expect(releaseRequirements).toContain("Starting April 28, 2026");
    expect(releaseRequirements).toMatch(/Xcode 26 or\s+later/);
    expect(releaseRequirements).toContain("targetSdk` `36");
    expect(releaseRequirements).toContain("src/native/ios/pbxproj.ts");
    expect(cliBuild).toContain("As of April 28, 2026");
    expect(cliBuild).toMatch(/Xcode\s+26 or later/);
    expect(cliBuild).toContain("`targetSdk` `36`");
    expect(quickstart).toContain("[Release Requirements](./release-requirements.md)");
    expect(quickstart).toContain("Android `targetSdk` `36`");
  });
});
