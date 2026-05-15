import type { NativiteBridgeNamespaceContract } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type SystemControlsPlatform = "ios" | "android" | "macos" | "unknown";
export type OrientationLock =
  | "portrait"
  | "portrait-up"
  | "portrait-down"
  | "landscape"
  | "landscape-left"
  | "landscape-right"
  | "all";
export type Orientation = "portrait" | "landscape" | "unknown";
export type SystemControlsErrorCode =
  | "unsupported"
  | "permission-denied"
  | "invalid-orientation-lock"
  | "invalid-arguments"
  | "native-unavailable"
  | "operation-failed";

export interface SystemControlsCapabilities {
  readonly platform: SystemControlsPlatform;
  readonly keepAwake: boolean;
  readonly orientation: boolean;
  readonly appBrightness: boolean;
  readonly powerStatus: boolean;
}

export interface KeepAwakeOptions {
  readonly key?: string;
}

export interface OrientationState {
  readonly orientation: Orientation;
  readonly lock: OrientationLock | null;
}

export interface BrightnessState {
  readonly brightness: number;
  readonly canRestore: boolean;
}

export interface PowerStatus {
  readonly lowPowerMode: boolean | null;
  readonly batteryLevel: number | null;
  readonly batteryState: "charging" | "full" | "unplugged" | "unknown";
}

export interface SystemControlsError {
  readonly code: SystemControlsErrorCode;
  readonly message: string;
  readonly platform?: SystemControlsPlatform;
  readonly operation?: string;
}

export interface SystemControlsBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly systemControls: {
    readonly methods: {
      readonly getCapabilities: { readonly result: SystemControlsCapabilities };
      readonly activateKeepAwake: {
        readonly params: KeepAwakeOptions;
        readonly result: { readonly active: true; readonly key: string };
      };
      readonly deactivateKeepAwake: {
        readonly params: KeepAwakeOptions;
        readonly result: { readonly active: boolean; readonly key: string };
      };
      readonly getOrientation: { readonly result: OrientationState };
      readonly lockOrientation: {
        readonly params: { readonly lock: OrientationLock };
        readonly result: OrientationState;
      };
      readonly unlockOrientation: { readonly result: OrientationState };
      readonly getBrightness: { readonly result: BrightnessState };
      readonly setBrightness: {
        readonly params: { readonly brightness: number };
        readonly result: BrightnessState;
      };
      readonly restoreBrightness: { readonly result: BrightnessState };
      readonly getPowerStatus: { readonly result: PowerStatus };
    };
    readonly events: {
      readonly "systemControls:orientationChange": OrientationState;
    };
  };
}

const SYSTEM_CONTROLS_NAMESPACE = "systemControls";
const ORIENTATION_CHANGE_EVENT = "systemControls:orientationChange";
const DEFAULT_KEEP_AWAKE_KEY = "default";

export const systemControls = definePlugin(
  {
    name: "nativite-system-controls",
    contracts: {} as SystemControlsBridgeContracts,
    bridge: {
      namespaces: [
        {
          name: SYSTEM_CONTROLS_NAMESPACE,
          methods: [
            "getCapabilities",
            "activateKeepAwake",
            "deactivateKeepAwake",
            "getOrientation",
            "lockOrientation",
            "unlockOrientation",
            "getBrightness",
            "setBrightness",
            "restoreBrightness",
            "getPowerStatus",
          ],
          events: [ORIENTATION_CHANGE_EVENT],
        },
      ],
    },
    platforms: {
      ios: {
        sources: ["./ios/NativiteSystemControlsPlugin.swift"],
        registrars: ["registerNativiteSystemControlsPlugin"],
        dependencies: ["UIKit"],
      },
      android: {
        sources: ["./android/NativiteSystemControlsPlugin.kt"],
        registrars: [
          {
            symbol: "registerNativiteSystemControlsPlugin",
            import: "dev.nativite.plugins.systemcontrols.registerNativiteSystemControlsPlugin",
          },
        ],
      },
    },
  },
  import.meta.url,
);

export async function getSystemControlCapabilities(): Promise<SystemControlsCapabilities> {
  return bridge.call(
    SYSTEM_CONTROLS_NAMESPACE,
    "getCapabilities",
    undefined,
  ) as Promise<SystemControlsCapabilities>;
}

export async function activateKeepAwake(
  options: KeepAwakeOptions = {},
): Promise<{ readonly active: true; readonly key: string }> {
  return bridge.call(SYSTEM_CONTROLS_NAMESPACE, "activateKeepAwake", {
    key: options.key ?? DEFAULT_KEEP_AWAKE_KEY,
  }) as Promise<{ readonly active: true; readonly key: string }>;
}

export async function deactivateKeepAwake(
  options: KeepAwakeOptions = {},
): Promise<{ readonly active: boolean; readonly key: string }> {
  return bridge.call(SYSTEM_CONTROLS_NAMESPACE, "deactivateKeepAwake", {
    key: options.key ?? DEFAULT_KEEP_AWAKE_KEY,
  }) as Promise<{ readonly active: boolean; readonly key: string }>;
}

export async function getOrientation(): Promise<OrientationState> {
  return bridge.call(
    SYSTEM_CONTROLS_NAMESPACE,
    "getOrientation",
    undefined,
  ) as Promise<OrientationState>;
}

export async function lockOrientation(lock: OrientationLock): Promise<OrientationState> {
  return bridge.call(SYSTEM_CONTROLS_NAMESPACE, "lockOrientation", {
    lock,
  }) as Promise<OrientationState>;
}

export async function unlockOrientation(): Promise<OrientationState> {
  return bridge.call(
    SYSTEM_CONTROLS_NAMESPACE,
    "unlockOrientation",
    undefined,
  ) as Promise<OrientationState>;
}

export async function getAppBrightness(): Promise<BrightnessState> {
  return bridge.call(
    SYSTEM_CONTROLS_NAMESPACE,
    "getBrightness",
    undefined,
  ) as Promise<BrightnessState>;
}

export async function setAppBrightness(brightness: number): Promise<BrightnessState> {
  return bridge.call(SYSTEM_CONTROLS_NAMESPACE, "setBrightness", {
    brightness,
  }) as Promise<BrightnessState>;
}

export async function restoreAppBrightness(): Promise<BrightnessState> {
  return bridge.call(
    SYSTEM_CONTROLS_NAMESPACE,
    "restoreBrightness",
    undefined,
  ) as Promise<BrightnessState>;
}

export async function getPowerStatus(): Promise<PowerStatus> {
  return bridge.call(
    SYSTEM_CONTROLS_NAMESPACE,
    "getPowerStatus",
    undefined,
  ) as Promise<PowerStatus>;
}
