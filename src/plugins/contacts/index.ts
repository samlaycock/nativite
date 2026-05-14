import type { NativiteBridgeNamespaceContract } from "../../index.ts";

import { bridge } from "../../client/index.ts";
import { definePlugin } from "../../index.ts";

export type ContactsPermissionStatus = "granted" | "denied" | "restricted" | "prompt" | "unknown";

export interface ContactsPermissionResponse {
  readonly status: ContactsPermissionStatus;
  readonly canAskAgain: boolean;
  readonly platform: "ios" | "android" | "macos" | "unknown";
}

export type ContactField =
  | "id"
  | "name"
  | "phones"
  | "emails"
  | "addresses"
  | "organization"
  | "birthday"
  | "note";

export interface ContactName {
  readonly givenName?: string;
  readonly middleName?: string;
  readonly familyName?: string;
  readonly nickname?: string;
  readonly displayName?: string;
}

export interface ContactLabeledValue {
  readonly label?: string;
  readonly value: string;
}

export interface ContactAddress {
  readonly label?: string;
  readonly street?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly country?: string;
}

export interface ContactRecord {
  readonly id: string;
  readonly name: ContactName;
  readonly phones?: ContactLabeledValue[];
  readonly emails?: ContactLabeledValue[];
  readonly addresses?: ContactAddress[];
  readonly organization?: string;
  readonly birthday?: string;
  readonly note?: string;
}

export interface ContactQueryOptions {
  readonly search?: string;
  readonly fields?: ContactField[];
  readonly pageSize?: number;
  readonly pageToken?: string;
}

export interface ContactQueryResult {
  readonly contacts: ContactRecord[];
  readonly nextPageToken?: string;
}

export interface ContactMutationResult {
  readonly id: string;
}

export interface ContactGroup {
  readonly id: string;
  readonly name: string;
}

export interface ContactError {
  readonly code:
    | "unsupported"
    | "permission-denied"
    | "invalid-arguments"
    | "native-unavailable"
    | "operation-failed";
  readonly message: string;
  readonly platform?: string;
  readonly operation?: string;
}

export interface ContactsBridgeContracts {
  readonly [key: string]: NativiteBridgeNamespaceContract;
  readonly contacts: {
    readonly methods: {
      readonly getPermissionStatus: {
        readonly result: ContactsPermissionResponse;
      };
      readonly requestPermissions: {
        readonly result: ContactsPermissionResponse;
      };
      readonly pickContact: {
        readonly params: { readonly fields?: ContactField[] };
        readonly result: ContactRecord | null;
      };
      readonly queryContacts: {
        readonly params: ContactQueryOptions;
        readonly result: ContactQueryResult;
      };
      readonly createContact: {
        readonly params: ContactRecord;
        readonly result: ContactMutationResult;
      };
      readonly updateContact: {
        readonly params: ContactRecord;
        readonly result: ContactMutationResult;
      };
      readonly deleteContact: {
        readonly params: { readonly id: string };
        readonly result: { readonly deleted: boolean };
      };
      readonly listGroups: {
        readonly result: { readonly groups: ContactGroup[] };
      };
      readonly exportVCard: {
        readonly params: { readonly ids: string[] };
        readonly result: { readonly vcard: string };
      };
    };
  };
}

const CONTACTS_NAMESPACE = "contacts";

export const contacts = definePlugin(
  {
    name: "nativite-contacts",
    contracts: {} as ContactsBridgeContracts,
    bridge: {
      namespaces: [
        {
          name: CONTACTS_NAMESPACE,
          methods: [
            "getPermissionStatus",
            "requestPermissions",
            "pickContact",
            "queryContacts",
            "createContact",
            "updateContact",
            "deleteContact",
            "listGroups",
            "exportVCard",
          ],
        },
      ],
    },
    platforms: {
      ios: {
        sources: ["./ios/NativiteContactsPlugin.swift"],
        registrars: ["registerNativiteContactsPlugin"],
        dependencies: ["Contacts", "ContactsUI"],
      },
      android: {
        sources: ["./android/NativiteContactsPlugin.kt"],
        registrars: [
          {
            symbol: "registerNativiteContactsPlugin",
            import: "dev.nativite.plugins.contacts.registerNativiteContactsPlugin",
          },
        ],
      },
    },
  },
  import.meta.url,
);

export async function getContactsPermissionStatus(): Promise<ContactsPermissionResponse> {
  return bridge.call(
    CONTACTS_NAMESPACE,
    "getPermissionStatus",
    undefined,
  ) as Promise<ContactsPermissionResponse>;
}

export async function requestContactsPermissions(): Promise<ContactsPermissionResponse> {
  return bridge.call(
    CONTACTS_NAMESPACE,
    "requestPermissions",
    undefined,
  ) as Promise<ContactsPermissionResponse>;
}

export async function pickContact(fields?: readonly ContactField[]): Promise<ContactRecord | null> {
  return bridge.call(CONTACTS_NAMESPACE, "pickContact", {
    fields,
  }) as Promise<ContactRecord | null>;
}

export async function queryContacts(
  options: ContactQueryOptions = {},
): Promise<ContactQueryResult> {
  return bridge.call(CONTACTS_NAMESPACE, "queryContacts", options) as Promise<ContactQueryResult>;
}

export async function createContact(contact: ContactRecord): Promise<ContactMutationResult> {
  return bridge.call(
    CONTACTS_NAMESPACE,
    "createContact",
    contact,
  ) as Promise<ContactMutationResult>;
}

export async function updateContact(contact: ContactRecord): Promise<ContactMutationResult> {
  return bridge.call(
    CONTACTS_NAMESPACE,
    "updateContact",
    contact,
  ) as Promise<ContactMutationResult>;
}

export async function deleteContact(id: string): Promise<{ readonly deleted: boolean }> {
  return bridge.call(CONTACTS_NAMESPACE, "deleteContact", { id }) as Promise<{
    readonly deleted: boolean;
  }>;
}

export async function listContactGroups(): Promise<{ readonly groups: ContactGroup[] }> {
  return bridge.call(CONTACTS_NAMESPACE, "listGroups", undefined) as Promise<{
    readonly groups: ContactGroup[];
  }>;
}

export async function exportContactsVCard(
  ids: readonly string[],
): Promise<{ readonly vcard: string }> {
  return bridge.call(CONTACTS_NAMESPACE, "exportVCard", { ids }) as Promise<{
    readonly vcard: string;
  }>;
}
