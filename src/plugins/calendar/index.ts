import type { NativiteBridgeNamespaceContract } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type CalendarPermissionKind = "events" | "reminders";
export type CalendarPermissionStatus = "granted" | "denied" | "restricted" | "prompt" | "unknown";
export type CalendarEntityType = "event" | "reminder";
export type CalendarSourceType =
  | "local"
  | "icloud"
  | "exchange"
  | "caldav"
  | "google"
  | "subscription"
  | "birthdays"
  | "unknown";
export type CalendarAvailability = "busy" | "free" | "tentative" | "unavailable" | "unknown";

export interface CalendarPermissionResponse {
  readonly status: CalendarPermissionStatus;
  readonly canAskAgain: boolean;
  readonly kind: CalendarPermissionKind;
  readonly platform: "ios" | "android" | "macos" | "unknown";
}

export interface CalendarSource {
  readonly id: string;
  readonly title: string;
  readonly type: CalendarSourceType;
}

export interface CalendarRecord {
  readonly id: string;
  readonly title: string;
  readonly sourceId?: string;
  readonly source?: CalendarSource;
  readonly allowsContentModifications: boolean;
  readonly entityTypes: CalendarEntityType[];
  readonly color?: string;
  readonly platform?: "ios" | "android" | "macos" | "unknown";
}

export interface CalendarDateRange {
  readonly startDate: string;
  readonly endDate: string;
}

export interface CalendarQueryOptions extends CalendarDateRange {
  readonly calendarIds?: readonly string[];
  readonly pageSize?: number;
  readonly pageToken?: string;
}

export interface CalendarEventAttendee {
  readonly name?: string;
  readonly email?: string;
  readonly status?: "accepted" | "declined" | "tentative" | "pending" | "unknown";
}

export interface CalendarEventRecurrenceRule {
  readonly frequency: "daily" | "weekly" | "monthly" | "yearly";
  readonly interval?: number;
  readonly endDate?: string;
  readonly occurrenceCount?: number;
}

export interface CalendarEventRecord {
  readonly id: string;
  readonly calendarId: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly allDay?: boolean;
  readonly location?: string;
  readonly notes?: string;
  readonly url?: string;
  readonly timeZone?: string;
  readonly availability?: CalendarAvailability;
  readonly attendees?: CalendarEventAttendee[];
  readonly recurrenceRules?: CalendarEventRecurrenceRule[];
}

export interface CalendarEventInput {
  readonly id?: string;
  readonly calendarId: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly allDay?: boolean;
  readonly location?: string;
  readonly notes?: string;
  readonly url?: string;
  readonly timeZone?: string;
  readonly availability?: CalendarAvailability;
  readonly recurrenceRules?: CalendarEventRecurrenceRule[];
}

export interface CalendarReminderRecord {
  readonly id: string;
  readonly calendarId: string;
  readonly title: string;
  readonly notes?: string;
  readonly dueDate?: string;
  readonly completed?: boolean;
}

export interface CalendarReminderInput {
  readonly id?: string;
  readonly calendarId: string;
  readonly title: string;
  readonly notes?: string;
  readonly dueDate?: string;
  readonly completed?: boolean;
}

export interface CalendarMutationResult {
  readonly id: string;
}

export interface CalendarDeleteResult {
  readonly deleted: boolean;
}

export interface CalendarOpenEventOptions {
  readonly id: string;
  readonly mode?: "view" | "edit";
}

export interface CalendarError {
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

export interface CalendarBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly calendar: {
    readonly methods: {
      readonly getPermissionStatus: {
        readonly params: { readonly kind?: CalendarPermissionKind };
        readonly result: CalendarPermissionResponse;
      };
      readonly requestPermissions: {
        readonly params: { readonly kind?: CalendarPermissionKind };
        readonly result: CalendarPermissionResponse;
      };
      readonly listCalendars: {
        readonly params: { readonly entityType?: CalendarEntityType };
        readonly result: { readonly calendars: CalendarRecord[] };
      };
      readonly queryEvents: {
        readonly params: CalendarQueryOptions;
        readonly result: {
          readonly events: CalendarEventRecord[];
          readonly nextPageToken?: string;
        };
      };
      readonly createEvent: {
        readonly params: CalendarEventInput;
        readonly result: CalendarMutationResult;
      };
      readonly updateEvent: {
        readonly params: CalendarEventInput;
        readonly result: CalendarMutationResult;
      };
      readonly deleteEvent: {
        readonly params: { readonly id: string };
        readonly result: CalendarDeleteResult;
      };
      readonly openEvent: {
        readonly params: CalendarOpenEventOptions;
        readonly result: { readonly opened: boolean };
      };
      readonly createReminder: {
        readonly params: CalendarReminderInput;
        readonly result: CalendarMutationResult;
      };
      readonly updateReminder: {
        readonly params: CalendarReminderInput;
        readonly result: CalendarMutationResult;
      };
      readonly deleteReminder: {
        readonly params: { readonly id: string };
        readonly result: CalendarDeleteResult;
      };
    };
  };
}

const CALENDAR_NAMESPACE = "calendar";

export const calendar = definePlugin(
  {
    name: "nativite-calendar",
    contracts: {} as CalendarBridgeContracts,
    bridge: {
      namespaces: [
        {
          name: CALENDAR_NAMESPACE,
          methods: [
            "getPermissionStatus",
            "requestPermissions",
            "listCalendars",
            "queryEvents",
            "createEvent",
            "updateEvent",
            "deleteEvent",
            "openEvent",
            "createReminder",
            "updateReminder",
            "deleteReminder",
          ],
        },
      ],
    },
    platforms: {
      ios: {
        sources: ["./ios/NativiteCalendarPlugin.swift"],
        registrars: ["registerNativiteCalendarPlugin"],
        dependencies: ["EventKit", "EventKitUI"],
      },
      android: {
        sources: ["./android/NativiteCalendarPlugin.kt"],
        registrars: [
          {
            symbol: "registerNativiteCalendarPlugin",
            import: "dev.nativite.plugins.calendar.registerNativiteCalendarPlugin",
          },
        ],
      },
    },
  },
  import.meta.url,
);

export async function getCalendarPermissionStatus(
  kind: CalendarPermissionKind = "events",
): Promise<CalendarPermissionResponse> {
  return bridge.call(CALENDAR_NAMESPACE, "getPermissionStatus", {
    kind,
  }) as Promise<CalendarPermissionResponse>;
}

export async function requestCalendarPermissions(
  kind: CalendarPermissionKind = "events",
): Promise<CalendarPermissionResponse> {
  return bridge.call(CALENDAR_NAMESPACE, "requestPermissions", {
    kind,
  }) as Promise<CalendarPermissionResponse>;
}

export async function listCalendars(
  entityType: CalendarEntityType = "event",
): Promise<{ readonly calendars: CalendarRecord[] }> {
  return bridge.call(CALENDAR_NAMESPACE, "listCalendars", { entityType }) as Promise<{
    readonly calendars: CalendarRecord[];
  }>;
}

export async function queryCalendarEvents(
  options: CalendarQueryOptions,
): Promise<{ readonly events: CalendarEventRecord[]; readonly nextPageToken?: string }> {
  return bridge.call(CALENDAR_NAMESPACE, "queryEvents", options) as Promise<{
    readonly events: CalendarEventRecord[];
    readonly nextPageToken?: string;
  }>;
}

export async function createCalendarEvent(
  event: CalendarEventInput,
): Promise<CalendarMutationResult> {
  return bridge.call(CALENDAR_NAMESPACE, "createEvent", event) as Promise<CalendarMutationResult>;
}

export async function updateCalendarEvent(
  event: CalendarEventInput,
): Promise<CalendarMutationResult> {
  return bridge.call(CALENDAR_NAMESPACE, "updateEvent", event) as Promise<CalendarMutationResult>;
}

export async function deleteCalendarEvent(id: string): Promise<CalendarDeleteResult> {
  return bridge.call(CALENDAR_NAMESPACE, "deleteEvent", { id }) as Promise<CalendarDeleteResult>;
}

export async function openCalendarEvent(
  options: CalendarOpenEventOptions,
): Promise<{ readonly opened: boolean }> {
  return bridge.call(CALENDAR_NAMESPACE, "openEvent", options) as Promise<{
    readonly opened: boolean;
  }>;
}

export async function createCalendarReminder(
  reminder: CalendarReminderInput,
): Promise<CalendarMutationResult> {
  return bridge.call(
    CALENDAR_NAMESPACE,
    "createReminder",
    reminder,
  ) as Promise<CalendarMutationResult>;
}

export async function updateCalendarReminder(
  reminder: CalendarReminderInput,
): Promise<CalendarMutationResult> {
  return bridge.call(
    CALENDAR_NAMESPACE,
    "updateReminder",
    reminder,
  ) as Promise<CalendarMutationResult>;
}

export async function deleteCalendarReminder(id: string): Promise<CalendarDeleteResult> {
  return bridge.call(CALENDAR_NAMESPACE, "deleteReminder", { id }) as Promise<CalendarDeleteResult>;
}
