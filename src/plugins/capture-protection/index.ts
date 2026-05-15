import type { NativiteBridgeNamespaceContract } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type CaptureProtectionPlatform = "ios" | "android" | "macos" | "unknown";
export type CaptureProtectionErrorCode =
  | "unsupported"
  | "permission-denied"
  | "invalid-arguments"
  | "native-unavailable"
  | "operation-failed";

export interface CaptureProtectionCapabilities {
  readonly platform: CaptureProtectionPlatform;
  readonly prevention: boolean;
  readonly screenshotDetection: boolean;
  readonly captureStatus: boolean;
}

export interface CaptureProtectionOptions {
  readonly key?: string;
}

export interface CaptureProtectionState {
  readonly platform: CaptureProtectionPlatform;
  readonly preventionActive: boolean;
  readonly activeKeys: readonly string[];
  readonly captured: boolean | null;
}

export interface CaptureProtectionStatusEvent {
  readonly platform: CaptureProtectionPlatform;
  readonly captured: boolean;
}

export interface CaptureProtectionScreenshotEvent {
  readonly platform: CaptureProtectionPlatform;
}

export interface CaptureProtectionError {
  readonly code: CaptureProtectionErrorCode;
  readonly message: string;
  readonly platform?: CaptureProtectionPlatform;
  readonly operation?: string;
}

export interface CaptureProtectionBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly captureProtection: {
    readonly methods: {
      readonly getCapabilities: { readonly result: CaptureProtectionCapabilities };
      readonly preventCapture: {
        readonly params: CaptureProtectionOptions;
        readonly result: CaptureProtectionState;
      };
      readonly allowCapture: {
        readonly params: CaptureProtectionOptions;
        readonly result: CaptureProtectionState;
      };
      readonly getState: { readonly result: CaptureProtectionState };
    };
    readonly events: {
      readonly "captureProtection:screenshot": CaptureProtectionScreenshotEvent;
      readonly "captureProtection:captureStatusChange": CaptureProtectionStatusEvent;
    };
  };
}

const CAPTURE_PROTECTION_NAMESPACE = "captureProtection";
const SCREENSHOT_EVENT = "captureProtection:screenshot";
const CAPTURE_STATUS_EVENT = "captureProtection:captureStatusChange";
const DEFAULT_CAPTURE_PROTECTION_KEY = "default";

export const captureProtection = definePlugin(
  {
    name: "nativite-capture-protection",
    contracts: {} as CaptureProtectionBridgeContracts,
    bridge: {
      namespaces: [
        {
          name: CAPTURE_PROTECTION_NAMESPACE,
          methods: ["getCapabilities", "preventCapture", "allowCapture", "getState"],
          events: [SCREENSHOT_EVENT, CAPTURE_STATUS_EVENT],
        },
      ],
    },
    platforms: {
      ios: {
        sources: ["./ios/NativiteCaptureProtectionPlugin.swift"],
        registrars: ["registerNativiteCaptureProtectionPlugin"],
        dependencies: ["UIKit"],
      },
      android: {
        sources: ["./android/NativiteCaptureProtectionPlugin.kt"],
        registrars: [
          {
            symbol: "registerNativiteCaptureProtectionPlugin",
            import:
              "dev.nativite.plugins.captureprotection.registerNativiteCaptureProtectionPlugin",
          },
        ],
      },
    },
  },
  import.meta.url,
);

export async function getCaptureProtectionCapabilities(): Promise<CaptureProtectionCapabilities> {
  return bridge.call(
    CAPTURE_PROTECTION_NAMESPACE,
    "getCapabilities",
    undefined,
  ) as Promise<CaptureProtectionCapabilities>;
}

export async function preventCapture(
  options: CaptureProtectionOptions = {},
): Promise<CaptureProtectionState> {
  return bridge.call(CAPTURE_PROTECTION_NAMESPACE, "preventCapture", {
    key: options.key ?? DEFAULT_CAPTURE_PROTECTION_KEY,
  }) as Promise<CaptureProtectionState>;
}

export async function allowCapture(
  options: CaptureProtectionOptions = {},
): Promise<CaptureProtectionState> {
  return bridge.call(CAPTURE_PROTECTION_NAMESPACE, "allowCapture", {
    key: options.key ?? DEFAULT_CAPTURE_PROTECTION_KEY,
  }) as Promise<CaptureProtectionState>;
}

export async function getCaptureProtectionState(): Promise<CaptureProtectionState> {
  return bridge.call(
    CAPTURE_PROTECTION_NAMESPACE,
    "getState",
    undefined,
  ) as Promise<CaptureProtectionState>;
}

export function onScreenshot(
  handler: (event: CaptureProtectionScreenshotEvent) => void,
): () => void {
  return bridge.subscribe(SCREENSHOT_EVENT, handler as (data: unknown) => void);
}

export function onCaptureStatusChange(
  handler: (event: CaptureProtectionStatusEvent) => void,
): () => void {
  return bridge.subscribe(CAPTURE_STATUS_EVENT, handler as (data: unknown) => void);
}
