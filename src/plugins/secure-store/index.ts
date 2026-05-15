import type { NativiteBridgeNamespaceContract } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type SecureStoreAccessControl = "none" | "user-presence" | "biometry-current-set";

export type SecureStoreErrorCode =
  | "unavailable"
  | "authentication-failed"
  | "invalidated"
  | "invalid-arguments"
  | "value-too-large"
  | "native-unavailable"
  | "operation-failed";

export interface SecureStoreOptions {
  readonly service?: string;
}

export interface SecureStoreSetOptions extends SecureStoreOptions {
  readonly accessControl?: SecureStoreAccessControl;
}

export interface SecureStoreGetOptions extends SecureStoreOptions {
  readonly authenticationPrompt?: string;
}

export interface SecureStoreDeleteOptions extends SecureStoreOptions {}

export interface SecureStoreAvailability {
  readonly available: boolean;
  readonly platform: "ios" | "android" | "macos" | "unknown";
  readonly supportsUserPresence: boolean;
  readonly supportsBiometryCurrentSet: boolean;
}

export interface SecureStoreError {
  readonly code: SecureStoreErrorCode;
  readonly message: string;
  readonly platform?: string;
  readonly operation?: string;
}

export interface SecureStoreBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly secureStore: {
    readonly methods: {
      readonly isAvailable: {
        readonly result: SecureStoreAvailability;
      };
      readonly getItem: {
        readonly params: { readonly key: string } & SecureStoreGetOptions;
        readonly result: string | null;
      };
      readonly setItem: {
        readonly params: { readonly key: string; readonly value: string } & SecureStoreSetOptions;
        readonly result: { readonly stored: true };
      };
      readonly deleteItem: {
        readonly params: { readonly key: string } & SecureStoreDeleteOptions;
        readonly result: { readonly deleted: boolean };
      };
    };
  };
}

const SECURE_STORE_NAMESPACE = "secureStore";

export const secureStore = definePlugin(
  {
    name: "nativite-secure-store",
    contracts: {} as SecureStoreBridgeContracts,
    bridge: {
      namespaces: [
        {
          name: SECURE_STORE_NAMESPACE,
          methods: ["isAvailable", "getItem", "setItem", "deleteItem"],
        },
      ],
    },
    platforms: {
      ios: {
        sources: ["./ios/NativiteSecureStorePlugin.swift"],
        registrars: ["registerNativiteSecureStorePlugin"],
        dependencies: ["Security", "LocalAuthentication"],
      },
      macos: {
        sources: ["./ios/NativiteSecureStorePlugin.swift"],
        registrars: ["registerNativiteSecureStorePlugin"],
        dependencies: ["Security", "LocalAuthentication"],
      },
      android: {
        sources: ["./android/NativiteSecureStorePlugin.kt"],
        registrars: [
          {
            symbol: "registerNativiteSecureStorePlugin",
            import: "dev.nativite.plugins.securestore.registerNativiteSecureStorePlugin",
          },
        ],
        dependencies: [
          {
            kind: "gradle",
            notation: "androidx.security:security-crypto:1.1.0",
            configuration: "implementation",
          },
        ],
      },
    },
  },
  import.meta.url,
);

export async function isSecureStoreAvailable(): Promise<SecureStoreAvailability> {
  return bridge.call(
    SECURE_STORE_NAMESPACE,
    "isAvailable",
    undefined,
  ) as Promise<SecureStoreAvailability>;
}

export async function getSecureItem(
  key: string,
  options: SecureStoreGetOptions = {},
): Promise<string | null> {
  return bridge.call(SECURE_STORE_NAMESPACE, "getItem", { key, ...options }) as Promise<
    string | null
  >;
}

export async function setSecureItem(
  key: string,
  value: string,
  options: SecureStoreSetOptions = {},
): Promise<{ readonly stored: true }> {
  return bridge.call(SECURE_STORE_NAMESPACE, "setItem", { key, value, ...options }) as Promise<{
    readonly stored: true;
  }>;
}

export async function deleteSecureItem(
  key: string,
  options: SecureStoreDeleteOptions = {},
): Promise<{ readonly deleted: boolean }> {
  return bridge.call(SECURE_STORE_NAMESPACE, "deleteItem", { key, ...options }) as Promise<{
    readonly deleted: boolean;
  }>;
}
