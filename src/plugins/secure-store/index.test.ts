import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { secureStore } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "SecureStoreApp",
      bundleId: "com.example.securestore",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "macos", minimumVersion: "14.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [secureStore],
  };
}

describe("secure store plugin", () => {
  it("exposes first-party secure store metadata", () => {
    expect(secureStore.name).toBe("nativite-secure-store");
    expect(secureStore.bridge?.namespaces?.[0]?.name).toBe("secureStore");
    expect(secureStore.bridge?.namespaces?.[0]?.methods).toEqual([
      "isAvailable",
      "getItem",
      "setItem",
      "deleteItem",
    ]);
  });

  it("resolves Apple and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/secure-store/ios/NativiteSecureStorePlugin.swift",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteSecureStorePlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([
      { name: "LocalAuthentication", weak: false },
      { name: "Security", weak: false },
    ]);
    expect(resolved.platforms.macos.registrars).toContain("registerNativiteSecureStorePlugin");
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/secure-store/android/NativiteSecureStorePlugin.kt",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.securestore.registerNativiteSecureStorePlugin",
    );
    expect(resolved.platforms.android.dependencies).toEqual([
      {
        kind: "gradle",
        notation: "androidx.security:security-crypto:1.1.0",
        configuration: "implementation",
      },
    ]);
  });

  it("documents and enforces the native string size limit", () => {
    const iosSource = readFileSync(
      join(process.cwd(), "src/plugins/secure-store/ios/NativiteSecureStorePlugin.swift"),
      "utf-8",
    );
    const androidSource = readFileSync(
      join(process.cwd(), "src/plugins/secure-store/android/NativiteSecureStorePlugin.kt"),
      "utf-8",
    );

    expect(iosSource).toContain("maxSecureStoreValueBytes = 4096");
    expect(iosSource).toContain('"value-too-large"');
    expect(androidSource).toContain("MAX_VALUE_BYTES = 4096");
    expect(androidSource).toContain('"value-too-large"');
  });
});
