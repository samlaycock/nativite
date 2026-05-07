import { describe, expect, it } from "bun:test";

import packageJson from "../../package.json";

describe("package scripts", () => {
  it("defines native runtime test scripts for iOS and Android", () => {
    expect(packageJson.scripts["test:native:ios"]).toBe("bun run scripts/test-native-ios.ts");
    expect(packageJson.scripts["test:native:android"]).toBe(
      "bun run scripts/test-native-android.ts",
    );
    expect(packageJson.scripts["test:native"]).toBe(
      "bun run test:native:ios && bun run test:native:android",
    );
  });
});
