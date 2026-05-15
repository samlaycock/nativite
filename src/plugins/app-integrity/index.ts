import type { NativiteBridgeNamespaceContract, NativitePlugin } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type AppIntegrityPlatform = "ios" | "android" | "unknown";
export type AppIntegrityProvider = "app-attest" | "play-integrity";
export type AppIntegrityErrorCode =
  | "unsupported-device"
  | "invalid-provider"
  | "invalid-arguments"
  | "quota-exceeded"
  | "rate-limited"
  | "server-unavailable"
  | "configuration-missing"
  | "native-failure";

export interface AppIntegrityError {
  readonly code: AppIntegrityErrorCode;
  readonly message: string;
  readonly platform: AppIntegrityPlatform;
}

export interface AppIntegrityAvailability {
  readonly available: boolean;
  readonly platform: AppIntegrityPlatform;
  readonly provider: AppIntegrityProvider;
  readonly error?: AppIntegrityError;
}

export interface AppAttestGenerateKeyResult {
  readonly keyId: string;
  readonly platform: "ios";
}

export interface AppAttestAttestationOptions {
  readonly keyId: string;
  readonly challengeBase64: string;
}

export interface AppAttestAttestationResult {
  readonly keyId: string;
  readonly attestationObjectBase64: string;
  readonly platform: "ios";
}

export interface AppAttestAssertionOptions {
  readonly keyId: string;
  readonly clientDataHashBase64: string;
}

export interface AppAttestAssertionResult {
  readonly keyId: string;
  readonly assertionObjectBase64: string;
  readonly platform: "ios";
}

export interface PlayIntegrityPrepareOptions {
  readonly cloudProjectNumber: number;
}

export interface PlayIntegrityPrepareResult {
  readonly prepared: true;
  readonly platform: "android";
}

export interface PlayIntegrityTokenOptions {
  readonly requestHash: string;
  readonly cloudProjectNumber?: number;
}

export interface PlayIntegrityTokenResult {
  readonly token: string;
  readonly platform: "android";
}

export interface AppIntegrityBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly appIntegrity: {
    readonly methods: {
      readonly isAppAttestAvailable: { readonly result: AppIntegrityAvailability };
      readonly generateAppAttestKey: { readonly result: AppAttestGenerateKeyResult };
      readonly attestAppAttestKey: {
        readonly params: AppAttestAttestationOptions;
        readonly result: AppAttestAttestationResult;
      };
      readonly generateAppAttestAssertion: {
        readonly params: AppAttestAssertionOptions;
        readonly result: AppAttestAssertionResult;
      };
      readonly isPlayIntegrityAvailable: { readonly result: AppIntegrityAvailability };
      readonly preparePlayIntegrityProvider: {
        readonly params: PlayIntegrityPrepareOptions;
        readonly result: PlayIntegrityPrepareResult;
      };
      readonly requestPlayIntegrityToken: {
        readonly params: PlayIntegrityTokenOptions;
        readonly result: PlayIntegrityTokenResult;
      };
    };
  };
}

const APP_INTEGRITY_NAMESPACE = "appIntegrity";

export const appIntegrity: NativitePlugin<AppIntegrityBridgeContracts> = definePlugin(
  {
    name: "nativite-app-integrity",
    contracts: {} as AppIntegrityBridgeContracts,
    bridge: {
      namespaces: [
        {
          name: APP_INTEGRITY_NAMESPACE,
          methods: [
            "isAppAttestAvailable",
            "generateAppAttestKey",
            "attestAppAttestKey",
            "generateAppAttestAssertion",
            "isPlayIntegrityAvailable",
            "preparePlayIntegrityProvider",
            "requestPlayIntegrityToken",
          ],
        },
      ],
    },
    platforms: {
      ios: {
        sources: ["./ios/NativiteAppIntegrityPlugin.swift"],
        registrars: ["registerNativiteAppIntegrityPlugin"],
        dependencies: ["DeviceCheck"],
      },
      android: {
        sources: ["./android/NativiteAppIntegrityPlugin.kt"],
        registrars: [
          {
            symbol: "registerNativiteAppIntegrityPlugin",
            import: "dev.nativite.plugins.appintegrity.registerNativiteAppIntegrityPlugin",
          },
        ],
        dependencies: [
          {
            kind: "gradle",
            notation: "com.google.android.play:integrity:1.6.0",
            configuration: "implementation",
          },
        ],
      },
    },
  },
  import.meta.url,
);

export async function isAppAttestAvailable(): Promise<AppIntegrityAvailability> {
  return bridge.call(
    APP_INTEGRITY_NAMESPACE,
    "isAppAttestAvailable",
    undefined,
  ) as Promise<AppIntegrityAvailability>;
}

export async function generateAppAttestKey(): Promise<AppAttestGenerateKeyResult> {
  return bridge.call(
    APP_INTEGRITY_NAMESPACE,
    "generateAppAttestKey",
    undefined,
  ) as Promise<AppAttestGenerateKeyResult>;
}

export async function attestAppAttestKey(
  options: AppAttestAttestationOptions,
): Promise<AppAttestAttestationResult> {
  return bridge.call(
    APP_INTEGRITY_NAMESPACE,
    "attestAppAttestKey",
    options,
  ) as Promise<AppAttestAttestationResult>;
}

export async function generateAppAttestAssertion(
  options: AppAttestAssertionOptions,
): Promise<AppAttestAssertionResult> {
  return bridge.call(
    APP_INTEGRITY_NAMESPACE,
    "generateAppAttestAssertion",
    options,
  ) as Promise<AppAttestAssertionResult>;
}

export async function isPlayIntegrityAvailable(): Promise<AppIntegrityAvailability> {
  return bridge.call(
    APP_INTEGRITY_NAMESPACE,
    "isPlayIntegrityAvailable",
    undefined,
  ) as Promise<AppIntegrityAvailability>;
}

export async function preparePlayIntegrityProvider(
  options: PlayIntegrityPrepareOptions,
): Promise<PlayIntegrityPrepareResult> {
  return bridge.call(
    APP_INTEGRITY_NAMESPACE,
    "preparePlayIntegrityProvider",
    options,
  ) as Promise<PlayIntegrityPrepareResult>;
}

export async function requestPlayIntegrityToken(
  options: PlayIntegrityTokenOptions,
): Promise<PlayIntegrityTokenResult> {
  return bridge.call(
    APP_INTEGRITY_NAMESPACE,
    "requestPlayIntegrityToken",
    options,
  ) as Promise<PlayIntegrityTokenResult>;
}
