import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { appIntegrity } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "AppIntegrityApp",
      bundleId: "com.example.appintegrity",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [appIntegrity],
  };
}

describe("app integrity plugin", () => {
  it("exposes first-party app integrity metadata", () => {
    expect(appIntegrity.name).toBe("nativite-app-integrity");
    expect(appIntegrity.bridge?.namespaces?.[0]?.name).toBe("appIntegrity");
    expect(appIntegrity.bridge?.namespaces?.[0]?.methods).toEqual([
      "isAppAttestAvailable",
      "generateAppAttestKey",
      "attestAppAttestKey",
      "generateAppAttestAssertion",
      "isPlayIntegrityAvailable",
      "preparePlayIntegrityProvider",
      "requestPlayIntegrityToken",
    ]);
  });

  it("resolves iOS and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/app-integrity/ios/NativiteAppIntegrityPlugin.swift",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteAppIntegrityPlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([{ name: "DeviceCheck", weak: false }]);
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/app-integrity/android/NativiteAppIntegrityPlugin.kt",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.appintegrity.registerNativiteAppIntegrityPlugin",
    );
    expect(resolved.platforms.android.dependencies).toContainEqual({
      kind: "gradle",
      notation: "com.google.android.play:integrity:1.6.0",
      configuration: "implementation",
    });
  });

  it("uses App Attest service APIs and structured unsupported-device responses", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/app-integrity/ios/NativiteAppIntegrityPlugin.swift"),
      "utf-8",
    );

    expect(source).toContain("import CryptoKit");
    expect(source).toContain("private func sha256Data");
    expect(source).toContain("let clientDataHash = sha256Data(challenge)");
    expect(source).toContain("completion(.failure(appIntegrityFailure(");
    expect(
      source.slice(
        source.indexOf("private func requireAppAttestSupport"),
        source.indexOf("private func sha256Data"),
      ),
    ).not.toContain("completion(.success(appAttestUnavailable()))");
    expect(source).toContain("DCAppAttestService.shared.isSupported");
    expect(source).toContain("generateKey");
    expect(source).toContain("attestKey");
    expect(source).toContain("generateAssertion");
    expect(source).toContain('"unsupported-device"');
  });

  it("uses Play Integrity standard provider preparation and token requests", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/app-integrity/android/NativiteAppIntegrityPlugin.kt"),
      "utf-8",
    );

    expect(source).toContain('IntegrityErrorCode.TOO_MANY_REQUESTS -> "quota-exceeded"');
    expect(source).toContain('StandardIntegrityErrorCode.TOO_MANY_REQUESTS -> "quota-exceeded"');
    expect(source).toContain(
      "AtomicReference<StandardIntegrityManager.StandardIntegrityTokenProvider?>",
    );
    expect(source).toContain("IntegrityManagerFactory.createStandard");
    expect(source).toContain("StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()");
    expect(source).toContain("StandardIntegrityManager.StandardIntegrityTokenRequest.builder()");
    expect(source).toContain("requestIntegrityToken");
    expect(source).not.toContain("error.message?.contains");
  });
});
