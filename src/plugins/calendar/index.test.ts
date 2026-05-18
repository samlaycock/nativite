import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { calendar } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "CalendarApp",
      bundleId: "com.example.calendar",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [calendar],
  };
}

describe("calendar plugin", () => {
  it("exposes the first-party calendar plugin metadata", () => {
    expect(calendar.name).toBe("nativite-calendar");
    expect(calendar.bridge?.namespaces?.[0]?.name).toBe("calendar");
    expect(calendar.bridge?.namespaces?.[0]?.methods).toContain("queryEvents");
    expect(calendar.bridge?.namespaces?.[0]?.methods).toContain("createReminder");
  });

  it("resolves iOS and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes("src/plugins/calendar/ios/NativiteCalendarPlugin.swift"),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteCalendarPlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([
      { name: "EventKit", weak: false },
      { name: "EventKitUI", weak: false },
    ]);
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes("src/plugins/calendar/android/NativiteCalendarPlugin.kt"),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.calendar.registerNativiteCalendarPlugin",
    );
  });

  it("implements iOS EventKit permission, calendar, event, and reminder operations", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/calendar/ios/NativiteCalendarPlugin.swift"),
      "utf-8",
    );

    expect(source).toContain("EKEventStore.authorizationStatus(for: entityType)");
    expect(source).toContain("requestFullAccessToEvents");
    expect(source).toContain("requestFullAccessToReminders");
    expect(source).toContain(
      "private func calendarOperationError(_ error: Error, operation: String) -> NSError",
    );
    expect(source).toContain("if nsError.domain == nativiteCalendarErrorDomain");
    expect(source).toContain('calendarOperationError(error, operation: "queryEvents")');
    expect(source).toContain('calendarOperationError(error, operation: "createEvent")');
    expect(source).toContain('calendarOperationError(error, operation: "updateEvent")');
    expect(source).toContain('calendarOperationError(error, operation: "createReminder")');
    expect(source).toContain('calendarOperationError(error, operation: "updateReminder")');
    expect(source).toContain("store.calendars(for: type)");
    expect(source).toContain("var entityTypes: [String] = []");
    expect(source).toContain("calendar.allowedEntityTypes.contains(.event)");
    expect(source).toContain("calendar.allowedEntityTypes.contains(.reminder)");
    expect(source).toContain("predicateForEvents(withStart: startDate, end: endDate");
    expect(source).toContain("store.save(event, span: .futureEvents, commit: true)");
    expect(source).toContain("store.remove(event, span: .futureEvents, commit: true)");
    expect(source).toContain("EKEventEditViewController");
    expect(source).toContain("editController.editViewDelegate = delegate");
    expect(source).toContain("eventEditViewController(_ controller: EKEventEditViewController");
    expect(source).toContain("objc_setAssociatedObject");
    expect(source).toContain("calendarEventEditDelegateKey");
    expect(source).toContain("calendarEventViewDismissTargetKey");
    expect(source).not.toContain("private var activeEventEditDelegate");
    expect(source).not.toContain("private var activeEventViewDismissTarget");
    expect(source).toContain('let mode = options["mode"] as? String ?? "view"');
    expect(source).toContain("EKEventViewController");
    expect(source).not.toContain("viewController.eventStore = store");
    expect(source).toContain("queryEvents requires options.");
    expect(source).toContain("createEvent requires an event.");
    expect(source).toContain("openEvent requires an id.");
    expect(source).toContain("createReminder requires a reminder.");
    expect(source).toContain('operation: "updateReminder"');
    expect(source).toContain("EKReminder(eventStore: store)");
  });

  it("implements Android CalendarContract calendar and event operations", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/calendar/android/NativiteCalendarPlugin.kt"),
      "utf-8",
    );

    expect(source).toContain("CalendarContract.Calendars.CONTENT_URI");
    expect(source).toContain("CalendarContract.Events.CONTENT_URI");
    expect(source).toContain("CalendarContract.Instances.CONTENT_URI");
    expect(source).toContain("ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI");
    expect(source).toContain("val permission = Manifest.permission.READ_CALENDAR");
    expect(source).toContain("val rows = context.contentResolver.update");
    expect(source).toContain(
      'calendarError("not-found", "Calendar event was not found.", "updateEvent")',
    );
    expect(source).toContain("val id = uri?.lastPathSegment");
    expect(source).toContain(
      'calendarError("operation-failed", "Failed to insert calendar event.", "createEvent")',
    );
    expect(source).toContain("private fun invalidArguments(error: Exception, operation: String)");
    expect(source).toContain('completion(Result.failure(invalidArguments(error, "queryEvents")))');
    expect(source).toContain('completion(Result.failure(invalidArguments(error, "createEvent")))');
    expect(source).toContain('completion(Result.failure(invalidArguments(error, "updateEvent")))');
    expect(source).toContain("private fun eventIdOrNull(input: JSONObject): Long?");
    expect(source).toContain("Event id must be a numeric string.");
    expect(source).not.toContain('args.getString("id").toLong()');
    expect(source).toContain("ActivityNotFoundException");
    expect(source).toContain(
      'calendarError("native-unavailable", "Android context is unavailable.", "openEvent")',
    );
    expect(source).toContain(
      'calendarError("native-unavailable", "No Android calendar app is available.", "openEvent")',
    );
    expect(source).toContain("Intent(Intent.ACTION_VIEW)");
    expect(source).toContain('unsupported("createReminder")');
    expect(source).not.toContain('if (kind == "reminders") Manifest.permission.READ_CALENDAR');
  });
});
