import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { notifications } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "NotificationsApp",
      bundleId: "com.example.notifications",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [notifications],
  };
}

describe("notifications plugin", () => {
  it("exposes the first-party notifications plugin metadata", () => {
    expect(notifications.name).toBe("nativite-notifications");
    expect(notifications.bridge?.namespaces?.[0]?.name).toBe("notifications");
    expect(notifications.bridge?.namespaces?.[0]?.methods).toContain("scheduleNotification");
    expect(notifications.bridge?.namespaces?.[0]?.events).toContain("notifications:response");
  });

  it("resolves iOS and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/notifications/ios/NativiteNotificationsPlugin.swift",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteNotificationsPlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([
      { name: "UserNotifications", weak: false },
    ]);
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes(
          "src/plugins/notifications/android/NativiteNotificationsPlugin.kt",
        ),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.notifications.registerNativiteNotificationsPlugin",
    );
  });

  it("implements structured unsupported push registration errors", () => {
    const iosSource = readFileSync(
      join(process.cwd(), "src/plugins/notifications/ios/NativiteNotificationsPlugin.swift"),
      "utf-8",
    );
    const androidSource = readFileSync(
      join(process.cwd(), "src/plugins/notifications/android/NativiteNotificationsPlugin.kt"),
      "utf-8",
    );

    expect(iosSource).toContain('method: "registerForPushNotifications"');
    expect(iosSource).toContain('notificationsError("unsupported"');
    expect(androidSource).toContain('"registerForPushNotifications"');
    expect(androidSource).toContain('notificationsError("unsupported"');
  });

  it("covers local notification permission, scheduling, and category APIs natively", () => {
    const iosSource = readFileSync(
      join(process.cwd(), "src/plugins/notifications/ios/NativiteNotificationsPlugin.swift"),
      "utf-8",
    );
    const androidSource = readFileSync(
      join(process.cwd(), "src/plugins/notifications/android/NativiteNotificationsPlugin.kt"),
      "utf-8",
    );

    expect(iosSource).toContain("UNUserNotificationCenter.current()");
    expect(iosSource).toContain("UNNotificationRequest(");
    expect(iosSource).toContain("UNNotificationCategory(");
    expect(androidSource).toContain("Manifest.permission.POST_NOTIFICATIONS");
    expect(androidSource).toContain("ActivityCompat.shouldShowRequestPermissionRationale");
    expect(androidSource).toContain('it.name == "requestPermission"');
    expect(androidSource).toContain("return@register");
    expect(androidSource).toContain("AlarmManager.RTC_WAKEUP");
    expect(androidSource).toContain("class NativiteNotificationReceiver : BroadcastReceiver()");
    expect(androidSource).toContain("ConcurrentHashMap");
    expect(androidSource).toContain("NotificationChannel(");
    expect(androidSource).toContain("NotificationCompat.Builder");
    expect(androidSource).not.toContain("mutableMapOf<String, Map<String, Any?>>()");
  });
});
