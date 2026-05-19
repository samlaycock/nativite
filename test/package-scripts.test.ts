import { describe, expect, it } from "bun:test";

import packageJson from "../package.json";

describe("package scripts", () => {
  it("declares Bun and Node as supported package and CLI runtimes", () => {
    expect(packageJson.engines).toEqual({ bun: ">=1.0.0", node: ">=18.0.0" });
    expect(packageJson.packageManager).toStartWith("bun@");
  });

  it("defines native runtime test scripts for iOS and Android", () => {
    expect(packageJson.scripts["test:native:ios"]).toBe("bun run scripts/test-native-ios.ts");
    expect(packageJson.scripts["test:native:android"]).toBe(
      "bun run scripts/test-native-android.ts",
    );
    expect(packageJson.scripts["test:native"]).toBe(
      "bun run test:native:ios && bun run test:native:android",
    );
  });

  it("defines generated native app smoke test scripts for all 1.0 platforms", () => {
    expect(packageJson.scripts["test:generated:native"]).toBe(
      "bun run scripts/test-generated-native-apps.ts",
    );
    expect(packageJson.scripts["test:generated:native:ios"]).toBe(
      "bun run scripts/test-generated-native-apps.ts --platform=ios",
    );
    expect(packageJson.scripts["test:generated:native:macos"]).toBe(
      "bun run scripts/test-generated-native-apps.ts --platform=macos",
    );
    expect(packageJson.scripts["test:generated:native:android"]).toBe(
      "bun run scripts/test-generated-native-apps.ts --platform=android",
    );
  });
});
