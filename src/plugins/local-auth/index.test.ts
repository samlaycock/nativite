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

  it("uses Android authentication errors as the single negative-button terminal path", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/android/NativiteLocalAuthPlugin.kt"),
      "utf-8",
    );
    const negativeButtonSource = source.slice(
      source.indexOf("builder.setNegativeButton"),
      source.indexOf("builder.build().authenticate"),
    );

    expect(negativeButtonSource).not.toContain("completion(");
    expect(negativeButtonSource).not.toContain("activeCancellation = null");
    expect(negativeButtonSource).toContain("onAuthenticationError is the terminal path");
  });

  it("aligns iOS enrollment with default authentication availability", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/ios/NativiteLocalAuthPlugin.swift"),
      "utf-8",
    );
    const isEnrolledSource = source.slice(
      source.indexOf('method: "isEnrolled"'),
      source.indexOf('method: "getSupportedTypes"'),
    );

    expect(isEnrolledSource).toContain(".deviceOwnerAuthenticationWithBiometrics");
    expect(isEnrolledSource).toContain(".deviceOwnerAuthentication");
  });

  it("reports iOS device credentials in supported local auth types", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/ios/NativiteLocalAuthPlugin.swift"),
      "utf-8",
    );
    const supportedTypesSource = source.slice(
      source.indexOf("private func supportedLocalAuthTypes"),
      source.indexOf("func registerNativiteLocalAuthPlugin"),
    );

    expect(supportedTypesSource).toContain(".deviceOwnerAuthenticationWithBiometrics");
    expect(supportedTypesSource).toContain(".deviceOwnerAuthentication");
    expect(supportedTypesSource).toContain('"device-credential"');
    expect(supportedTypesSource).toContain("return deviceCredentialTypes");
    expect(supportedTypesSource).toContain('return ["unknown"] + deviceCredentialTypes');
  });

  it("returns unavailable for missing iOS authentication reasons", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/ios/NativiteLocalAuthPlugin.swift"),
      "utf-8",
    );
    const authenticateSource = source.slice(
      source.indexOf('method: "authenticate"'),
      source.indexOf('method: "cancel"'),
    );
    const missingReasonSource = authenticateSource.slice(
      authenticateSource.indexOf("else {"),
      authenticateSource.indexOf("let context = LAContext()"),
    );

    expect(missingReasonSource).toContain('"status": "unavailable"');
    expect(missingReasonSource).toContain("Missing authentication reason.");
    expect(missingReasonSource).not.toContain('"status": "failed"');
  });

  it("distinguishes Android biometric support from device credential support", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/android/NativiteLocalAuthPlugin.kt"),
      "utf-8",
    );
    const supportedTypesSource = source.slice(
      source.indexOf('register(bridge, "getSupportedTypes")'),
      source.indexOf('register(bridge, "authenticate")'),
    );

    expect(source).toContain("private fun canAuthenticateBiometric");
    expect(source).toContain("private fun canAuthenticateDeviceCredential");
    expect(supportedTypesSource).not.toContain("canAuthenticate(context)");
    expect(supportedTypesSource).toContain("canAuthenticateBiometric(context)");
    expect(supportedTypesSource).toContain("canAuthenticateDeviceCredential(context)");
  });

  it("aligns Android authentication with availability API level support", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/android/NativiteLocalAuthPlugin.kt"),
      "utf-8",
    );
    const authenticateSource = source.slice(
      source.indexOf('register(bridge, "authenticate")'),
      source.indexOf('register(bridge, "cancel")'),
    );

    expect(authenticateSource).toContain("Build.VERSION.SDK_INT < Build.VERSION_CODES.Q");
    expect(authenticateSource).toContain("Local authentication requires Android 10+");
    expect(authenticateSource).not.toContain("Build.VERSION.SDK_INT < Build.VERSION_CODES.P");
    expect(authenticateSource).not.toContain("Local authentication requires Android 9+");
  });

  it("maps the Android biometric negative button to cancelled without using unavailable SDK constants", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/local-auth/android/NativiteLocalAuthPlugin.kt"),
      "utf-8",
    );
    const statusSource = source.slice(
      source.indexOf("private fun statusFor"),
      source.indexOf("fun registerNativiteLocalAuthPlugin"),
    );

    expect(source).toContain("private const val AUTH_NEGATIVE_BUTTON = 13");
    expect(statusSource).toContain("AUTH_NEGATIVE_BUTTON");
    expect(statusSource).toContain('-> "cancelled"');
    expect(statusSource).not.toContain("BIOMETRIC_ERROR_NEGATIVE_BUTTON");
  });
});
