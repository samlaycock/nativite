import type { NativiteBridgeNamespaceContract } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type NotificationPermissionStatus = "granted" | "denied" | "prompt" | "unknown";
export type NotificationPlatform = "ios" | "android" | "macos" | "unknown";
export type NotificationTrigger =
  | { readonly type: "date"; readonly date: string }
  | { readonly type: "timeInterval"; readonly seconds: number; readonly repeats?: boolean };

export interface NotificationPermissionResponse {
  readonly status: NotificationPermissionStatus;
  readonly canAskAgain: boolean;
  readonly platform: NotificationPlatform;
}

export interface NotificationChannel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly importance?: "min" | "low" | "default" | "high" | "max";
  readonly sound?: string;
}

export interface NotificationAction {
  readonly id: string;
  readonly title: string;
  readonly foreground?: boolean;
  readonly destructive?: boolean;
  readonly authenticationRequired?: boolean;
}

export interface NotificationCategory {
  readonly id: string;
  readonly actions: readonly NotificationAction[];
}

export interface NotificationContent {
  readonly title: string;
  readonly body?: string;
  readonly subtitle?: string;
  readonly badge?: number;
  readonly sound?: string;
  readonly categoryId?: string;
  readonly channelId?: string;
  readonly data?: Record<string, unknown>;
}

export interface ScheduleNotificationOptions {
  readonly id?: string;
  readonly content: NotificationContent;
  readonly trigger: NotificationTrigger;
}

export interface ScheduledNotification {
  readonly id: string;
  readonly content: NotificationContent;
  readonly trigger?: NotificationTrigger;
}

export interface NotificationResponse {
  readonly notificationId: string;
  readonly actionId?: string;
  readonly data?: Record<string, unknown>;
}

export interface ForegroundNotificationPolicy {
  readonly showAlert?: boolean;
  readonly playSound?: boolean;
  readonly setBadge?: boolean;
}

export interface PushTokenOptions {
  readonly service: "apns" | "fcm";
}

export interface PushTokenResult {
  readonly token: string;
  readonly service: "apns" | "fcm";
}

export interface NotificationError {
  readonly code:
    | "unsupported"
    | "permission-denied"
    | "invalid-arguments"
    | "native-unavailable"
    | "not-found"
    | "operation-failed";
  readonly message: string;
  readonly platform?: string;
  readonly operation?: string;
}

export interface NotificationsBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly notifications: {
    readonly methods: {
      readonly getPermissionStatus: { readonly result: NotificationPermissionResponse };
      readonly requestPermissions: { readonly result: NotificationPermissionResponse };
      readonly createChannel: {
        readonly params: NotificationChannel;
        readonly result: { readonly id: string };
      };
      readonly setCategories: {
        readonly params: { readonly categories: readonly NotificationCategory[] };
        readonly result: { readonly registered: number };
      };
      readonly scheduleNotification: {
        readonly params: ScheduleNotificationOptions;
        readonly result: { readonly id: string };
      };
      readonly cancelNotification: {
        readonly params: { readonly id: string };
        readonly result: { readonly cancelled: boolean };
      };
      readonly cancelAllNotifications: {
        readonly result: { readonly cancelled: boolean };
      };
      readonly listScheduledNotifications: {
        readonly result: { readonly notifications: ScheduledNotification[] };
      };
      readonly getInitialNotificationResponse: {
        readonly result: NotificationResponse | null;
      };
      readonly setForegroundNotificationPolicy: {
        readonly params: ForegroundNotificationPolicy;
        readonly result: ForegroundNotificationPolicy;
      };
      readonly registerForPushNotifications: {
        readonly params: PushTokenOptions;
        readonly result: PushTokenResult;
      };
    };
    readonly events: {
      readonly "notifications:response": NotificationResponse;
    };
  };
}

const NOTIFICATIONS_NAMESPACE = "notifications";
const RESPONSE_EVENT = "notifications:response";

export const notifications = definePlugin(
  {
    name: "nativite-notifications",
    contracts: {} as NotificationsBridgeContracts,
    bridge: {
      namespaces: [
        {
          name: NOTIFICATIONS_NAMESPACE,
          methods: [
            "getPermissionStatus",
            "requestPermissions",
            "createChannel",
            "setCategories",
            "scheduleNotification",
            "cancelNotification",
            "cancelAllNotifications",
            "listScheduledNotifications",
            "getInitialNotificationResponse",
            "setForegroundNotificationPolicy",
            "registerForPushNotifications",
          ],
          events: [RESPONSE_EVENT],
        },
      ],
    },
    platforms: {
      ios: {
        sources: ["./ios/NativiteNotificationsPlugin.swift"],
        registrars: ["registerNativiteNotificationsPlugin"],
        dependencies: ["UserNotifications"],
      },
      android: {
        sources: ["./android/NativiteNotificationsPlugin.kt"],
        registrars: [
          {
            symbol: "registerNativiteNotificationsPlugin",
            import: "dev.nativite.plugins.notifications.registerNativiteNotificationsPlugin",
          },
        ],
      },
    },
  },
  import.meta.url,
);

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionResponse> {
  return bridge.call(
    NOTIFICATIONS_NAMESPACE,
    "getPermissionStatus",
    undefined,
  ) as Promise<NotificationPermissionResponse>;
}

export async function requestNotificationPermissions(): Promise<NotificationPermissionResponse> {
  return bridge.call(
    NOTIFICATIONS_NAMESPACE,
    "requestPermissions",
    undefined,
  ) as Promise<NotificationPermissionResponse>;
}

export async function createNotificationChannel(
  channel: NotificationChannel,
): Promise<{ readonly id: string }> {
  return bridge.call(NOTIFICATIONS_NAMESPACE, "createChannel", channel) as Promise<{
    readonly id: string;
  }>;
}

export async function setNotificationCategories(
  categories: readonly NotificationCategory[],
): Promise<{ readonly registered: number }> {
  return bridge.call(NOTIFICATIONS_NAMESPACE, "setCategories", { categories }) as Promise<{
    readonly registered: number;
  }>;
}

export async function scheduleNotification(
  options: ScheduleNotificationOptions,
): Promise<{ readonly id: string }> {
  return bridge.call(NOTIFICATIONS_NAMESPACE, "scheduleNotification", options) as Promise<{
    readonly id: string;
  }>;
}

export async function cancelNotification(id: string): Promise<{ readonly cancelled: boolean }> {
  return bridge.call(NOTIFICATIONS_NAMESPACE, "cancelNotification", { id }) as Promise<{
    readonly cancelled: boolean;
  }>;
}

export async function cancelAllNotifications(): Promise<{ readonly cancelled: boolean }> {
  return bridge.call(NOTIFICATIONS_NAMESPACE, "cancelAllNotifications", undefined) as Promise<{
    readonly cancelled: boolean;
  }>;
}

export async function listScheduledNotifications(): Promise<{
  readonly notifications: ScheduledNotification[];
}> {
  return bridge.call(NOTIFICATIONS_NAMESPACE, "listScheduledNotifications", undefined) as Promise<{
    readonly notifications: ScheduledNotification[];
  }>;
}

export async function getInitialNotificationResponse(): Promise<NotificationResponse | null> {
  return bridge.call(
    NOTIFICATIONS_NAMESPACE,
    "getInitialNotificationResponse",
    undefined,
  ) as Promise<NotificationResponse | null>;
}

export async function setForegroundNotificationPolicy(
  policy: ForegroundNotificationPolicy,
): Promise<ForegroundNotificationPolicy> {
  return bridge.call(
    NOTIFICATIONS_NAMESPACE,
    "setForegroundNotificationPolicy",
    policy,
  ) as Promise<ForegroundNotificationPolicy>;
}

export async function registerForPushNotifications(
  options: PushTokenOptions,
): Promise<PushTokenResult> {
  return bridge.call(
    NOTIFICATIONS_NAMESPACE,
    "registerForPushNotifications",
    options,
  ) as Promise<PushTokenResult>;
}

export function onNotificationResponse(
  handler: (response: NotificationResponse) => void,
): () => void {
  return bridge.subscribe(RESPONSE_EVENT, handler as (data: unknown) => void);
}
