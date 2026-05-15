import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { localAuth } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "LocalAuthApp",
      bundleId: "com.example.localauth",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [localAuth({ faceIDUsageDescription: "Verify your identity." })],
  };
}

describe("local auth plugin", () => {
  it("exposes first-party local auth metadata", () => {
    const plugin = localAuth();

    expect(plugin.name).toBe("nativite-local-auth");
    expect(plugin.bridge?.namespaces?.[0]?.name).toBe("localAuth");
    expect(plugin.bridge?.namespaces?.[0]?.methods).toEqual([
      "isAvailable",
      "isEnrolled",
      "getSupportedTypes",
      "authenticate",
      "cancel",
    ]);
  });

  it("keeps the Face ID usage description configurable for generation", () => {
    expect(
      localAuth({ faceIDUsageDescription: "Verify your identity." }).faceIDUsageDescription,
    ).toBe("Verify your identity.");
  });

  it("resolves Apple and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes("src/plugins/local-auth/ios/NativiteLocalAuthPlugin.swift"),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteLocalAuthPlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([
      { name: "LocalAuthentication", weak: false },
    ]);
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes("src/plugins/local-auth/android/NativiteLocalAuthPlugin.kt"),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.localauth.registerNativiteLocalAuthPlugin",
    );
  });

  it("does not emit an iOS availability reason when fallback authentication is available", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/ios/NativiteLocalAuthPlugin.swift"),
      "utf-8",
    );

    expect(source).toContain("guard !available, let error else");
    expect(source).toContain('return ["available": available, "platform": "ios"]');
  });

  it("keeps Android failed biometric attempts non-terminal", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/android/NativiteLocalAuthPlugin.kt"),
      "utf-8",
    );
    const callbackSource = source.slice(
      source.indexOf("override fun onAuthenticationFailed()"),
      source.indexOf('register(bridge, "cancel")'),
    );

    expect(callbackSource).not.toContain("completion(");
    expect(callbackSource).toContain("Non-terminal callback");
  });
});
