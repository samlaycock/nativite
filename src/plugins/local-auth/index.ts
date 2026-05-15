import type { NativiteBridgeNamespaceContract, NativitePlugin } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type LocalAuthPlatform = "ios" | "android" | "macos" | "unknown";
export type LocalAuthType = "fingerprint" | "face" | "iris" | "device-credential" | "unknown";
export type LocalAuthResultStatus =
  | "success"
  | "cancelled"
  | "fallback"
  | "failed"
  | "lockout"
  | "not-enrolled"
  | "unavailable";

export interface LocalAuthPluginOptions {
  readonly faceIDUsageDescription?: string;
}

export interface LocalAuthAvailability {
  readonly available: boolean;
  readonly platform: LocalAuthPlatform;
  readonly reason?: "unsupported" | "not-enrolled" | "passcode-not-set" | "hardware-unavailable";
}

export interface LocalAuthEnrolledResult {
  readonly enrolled: boolean;
  readonly platform: LocalAuthPlatform;
}

export interface LocalAuthSupportedTypesResult {
  readonly types: readonly LocalAuthType[];
  readonly platform: LocalAuthPlatform;
}

export interface LocalAuthAuthenticateOptions {
  readonly reason: string;
  readonly cancelTitle?: string;
  readonly fallbackTitle?: string;
  readonly disableDeviceFallback?: boolean;
}

export interface LocalAuthResult {
  readonly status: LocalAuthResultStatus;
  readonly success: boolean;
  readonly platform: LocalAuthPlatform;
  readonly error?: string;
}

export interface LocalAuthBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly localAuth: {
    readonly methods: {
      readonly isAvailable: { readonly result: LocalAuthAvailability };
      readonly isEnrolled: { readonly result: LocalAuthEnrolledResult };
      readonly getSupportedTypes: { readonly result: LocalAuthSupportedTypesResult };
      readonly authenticate: {
        readonly params: LocalAuthAuthenticateOptions;
        readonly result: LocalAuthResult;
      };
      readonly cancel: { readonly result: { readonly cancelled: boolean } };
    };
  };
}

const LOCAL_AUTH_NAMESPACE = "localAuth";
const DEFAULT_FACE_ID_USAGE_DESCRIPTION =
  "Allow this app to use Face ID for local user-presence verification.";

export function localAuth(
  options: LocalAuthPluginOptions = {},
): NativitePlugin<LocalAuthBridgeContracts> {
  return definePlugin(
    {
      name: "nativite-local-auth",
      contracts: {} as LocalAuthBridgeContracts,
      faceIDUsageDescription: options.faceIDUsageDescription ?? DEFAULT_FACE_ID_USAGE_DESCRIPTION,
      bridge: {
        namespaces: [
          {
            name: LOCAL_AUTH_NAMESPACE,
            methods: ["isAvailable", "isEnrolled", "getSupportedTypes", "authenticate", "cancel"],
          },
        ],
      },
      platforms: {
        ios: {
          sources: ["./ios/NativiteLocalAuthPlugin.swift"],
          registrars: ["registerNativiteLocalAuthPlugin"],
          dependencies: ["LocalAuthentication"],
        },
        android: {
          sources: ["./android/NativiteLocalAuthPlugin.kt"],
          registrars: [
            {
              symbol: "registerNativiteLocalAuthPlugin",
              import: "dev.nativite.plugins.localauth.registerNativiteLocalAuthPlugin",
            },
          ],
        },
      },
    },
    import.meta.url,
  );
}

export async function isLocalAuthAvailable(): Promise<LocalAuthAvailability> {
  return bridge.call(
    LOCAL_AUTH_NAMESPACE,
    "isAvailable",
    undefined,
  ) as Promise<LocalAuthAvailability>;
}

export async function isLocalAuthEnrolled(): Promise<LocalAuthEnrolledResult> {
  return bridge.call(
    LOCAL_AUTH_NAMESPACE,
    "isEnrolled",
    undefined,
  ) as Promise<LocalAuthEnrolledResult>;
}

export async function getLocalAuthSupportedTypes(): Promise<LocalAuthSupportedTypesResult> {
  return bridge.call(
    LOCAL_AUTH_NAMESPACE,
    "getSupportedTypes",
    undefined,
  ) as Promise<LocalAuthSupportedTypesResult>;
}

export async function authenticateLocalUser(
  options: LocalAuthAuthenticateOptions,
): Promise<LocalAuthResult> {
  return bridge.call(LOCAL_AUTH_NAMESPACE, "authenticate", options) as Promise<LocalAuthResult>;
}

export async function cancelLocalAuth(): Promise<{ readonly cancelled: boolean }> {
  return bridge.call(LOCAL_AUTH_NAMESPACE, "cancel", undefined) as Promise<{
    readonly cancelled: boolean;
  }>;
}
