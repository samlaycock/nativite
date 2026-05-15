import type { NativiteBridgeNamespaceContract } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type HapticsPlatform = "ios" | "android" | "macos" | "unknown";
export type ImpactFeedbackStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
export type NotificationFeedbackStyle = "success" | "warning" | "error";
export type HapticsErrorCode =
  | "unsupported"
  | "invalid-impact-style"
  | "invalid-notification-style"
  | "native-unavailable"
  | "operation-failed";

export interface HapticsCapabilities {
  readonly platform: HapticsPlatform;
  readonly available: boolean;
  readonly selection: boolean;
  readonly impact: readonly ImpactFeedbackStyle[];
  readonly notification: readonly NotificationFeedbackStyle[];
}

export interface HapticsError {
  readonly code: HapticsErrorCode;
  readonly message: string;
  readonly platform?: HapticsPlatform;
  readonly operation?: string;
}

export interface HapticsBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly haptics: {
    readonly methods: {
      readonly getCapabilities: { readonly result: HapticsCapabilities };
      readonly selection: { readonly result: { readonly performed: boolean } };
      readonly impact: {
        readonly params: { readonly style: ImpactFeedbackStyle };
        readonly result: { readonly performed: boolean; readonly style: ImpactFeedbackStyle };
      };
      readonly notification: {
        readonly params: { readonly style: NotificationFeedbackStyle };
        readonly result: { readonly performed: boolean; readonly style: NotificationFeedbackStyle };
      };
    };
    readonly events: {};
  };
}

const HAPTICS_NAMESPACE = "haptics";

export const haptics = definePlugin(
  {
    name: "nativite-haptics",
    contracts: {} as HapticsBridgeContracts,
    bridge: {
      namespaces: [
        {
          name: HAPTICS_NAMESPACE,
          methods: ["getCapabilities", "selection", "impact", "notification"],
        },
      ],
    },
    platforms: {
      ios: {
        sources: ["./ios/NativiteHapticsPlugin.swift"],
        registrars: ["registerNativiteHapticsPlugin"],
        dependencies: ["UIKit"],
      },
      android: {
        sources: ["./android/NativiteHapticsPlugin.kt"],
        registrars: [
          {
            symbol: "registerNativiteHapticsPlugin",
            import: "dev.nativite.plugins.haptics.registerNativiteHapticsPlugin",
          },
        ],
      },
    },
  },
  import.meta.url,
);

export async function getHapticsCapabilities(): Promise<HapticsCapabilities> {
  return bridge.call(
    HAPTICS_NAMESPACE,
    "getCapabilities",
    undefined,
  ) as Promise<HapticsCapabilities>;
}

export async function selectionFeedback(): Promise<{ readonly performed: boolean }> {
  return bridge.call(HAPTICS_NAMESPACE, "selection", undefined) as Promise<{
    readonly performed: boolean;
  }>;
}

export async function impactFeedback(
  style: ImpactFeedbackStyle = "medium",
): Promise<{ readonly performed: boolean; readonly style: ImpactFeedbackStyle }> {
  return bridge.call(HAPTICS_NAMESPACE, "impact", { style }) as Promise<{
    readonly performed: boolean;
    readonly style: ImpactFeedbackStyle;
  }>;
}

export async function notificationFeedback(
  style: NotificationFeedbackStyle,
): Promise<{ readonly performed: boolean; readonly style: NotificationFeedbackStyle }> {
  return bridge.call(HAPTICS_NAMESPACE, "notification", { style }) as Promise<{
    readonly performed: boolean;
    readonly style: NotificationFeedbackStyle;
  }>;
}
