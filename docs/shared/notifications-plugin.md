# Notifications Plugin

`nativite/plugins/notifications` provides a first-party native plugin for local
notifications in Nativite apps.

```ts
import {
  notifications,
  requestNotificationPermissions,
  scheduleNotification,
} from "nativite/plugins/notifications";
```

Add `notifications` to `nativite.config.ts`:

```ts
import { defineConfig } from "nativite";
import { notifications } from "nativite/plugins/notifications";

export default defineConfig({
  plugins: [notifications],
});
```

## API

- `getNotificationPermissionStatus()` returns `{ status, canAskAgain, platform }`.
- `requestNotificationPermissions()` requests native notification permission.
- `createNotificationChannel(channel)` creates an Android notification channel.
  iOS accepts the call and returns the channel id so shared setup code can run
  on both platforms.
- `setNotificationCategories(categories)` registers iOS categories/actions.
  Android currently records support at the bridge level and returns the number
  supplied.
- `scheduleNotification({ id, content, trigger })` schedules a local
  notification. `trigger` supports `{ type: "date", date }` and
  `{ type: "timeInterval", seconds, repeats }`.
- `cancelNotification(id)` and `cancelAllNotifications()` cancel local
  notifications.
- `listScheduledNotifications()` lists pending iOS requests and Android
  notifications scheduled during the current process.
- `getInitialNotificationResponse()` and `onNotificationResponse(handler)`
  define the launch/response contract. Full app-delegate/intent response
  delivery is reserved for follow-up native lifecycle work.
- `setForegroundNotificationPolicy(policy)` stores the desired foreground
  presentation policy.
- `registerForPushNotifications({ service })` is intentionally unsupported in
  this first release and fails with a structured `unsupported` error. Push token
  registration requires APNs or FCM project setup, signing, and delivery
  configuration.

## Platform Generation

When the plugin is present, iOS generation includes the
`UserNotifications` framework and an `NSUserNotificationsUsageDescription`
Info.plist entry. Android generation includes
`android.permission.POST_NOTIFICATIONS` and the notifications Kotlin source.

Unsupported operations fail with structured native errors:

```json
{
  "code": "unsupported",
  "message": "Push token registration requires app-specific APNs or FCM setup...",
  "platform": "ios",
  "operation": "registerForPushNotifications"
}
```
