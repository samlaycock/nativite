# Calendar Plugin

The first-party calendar plugin exposes native calendar, event, and reminder functionality through the Nativite bridge.

```ts
import {
  calendar,
  listCalendars,
  queryCalendarEvents,
  requestCalendarPermissions,
} from "nativite/plugins/calendar";

export default {
  plugins: [calendar],
};

await requestCalendarPermissions("events");
const { calendars } = await listCalendars("event");
const { events } = await queryCalendarEvents({
  calendarIds: calendars.map((entry) => entry.id),
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
});
```

## API Shape

- `getCalendarPermissionStatus(kind)` returns the current permission state for `events` or `reminders`.
- `requestCalendarPermissions(kind)` requests native access when the platform can present a permission prompt.
- `listCalendars(entityType)` returns native calendars with stable IDs, source metadata, supported entity types, and mutation capability metadata.
- `queryCalendarEvents(options)` returns events within a bounded ISO date range and optional calendar ID filter.
- `createCalendarEvent`, `updateCalendarEvent`, and `deleteCalendarEvent` mutate supported native events.
- `openCalendarEvent` opens a native event view or edit flow when available.
- `createCalendarReminder`, `updateCalendarReminder`, and `deleteCalendarReminder` mutate reminders where the platform supports reminders.

Structured native failures use plugin-level codes such as `permission-denied`, `invalid-arguments`, `not-found`, `unsupported`, and `operation-failed`.

## Platform Behavior

iOS uses EventKit and EventKitUI. Generated projects include EventKit framework dependencies and calendar/reminder Info.plist usage descriptions. Events and reminders are supported. Native event editing is presented with `EKEventEditViewController`.

Android uses `CalendarContract` for calendars and events. Generated projects include `READ_CALENDAR` and `WRITE_CALENDAR`. Android has no system reminders provider equivalent in `CalendarContract`, so reminder operations fail with documented `unsupported` errors.

## Permissions

Apps should request permissions before querying or mutating data. iOS separates events and reminders. Android calendar permissions cover calendar event provider access; Nativite cannot present runtime permission UI from this plugin context yet, so `requestCalendarPermissions` reports the current manifest/runtime permission state.
