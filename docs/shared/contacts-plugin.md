# Contacts Plugin

The first-party contacts plugin exposes native address-book functionality from
`nativite/plugins/contacts`.

## Configuration

Add the plugin to `nativite.config.ts`:

```ts
import { contacts } from "nativite/plugins/contacts";
import { android, defineConfig, ios } from "nativite";

export default defineConfig({
  app: {
    name: "ContactsApp",
    bundleId: "com.example.contacts",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios(), android()],
  plugins: [contacts],
});
```

Project generation copies the plugin native sources and registers the bridge
namespace through the normal Nativite plugin registrant.

## JavaScript API

```ts
import {
  getContactsPermissionStatus,
  pickContact,
  queryContacts,
  requestContactsPermissions,
} from "nativite/plugins/contacts";

const permission = await requestContactsPermissions();

if (permission.status === "granted") {
  const page = await queryContacts({
    search: "Ada",
    fields: ["id", "name", "emails", "phones"],
    pageSize: 50,
  });

  const selected = await pickContact(["id", "name", "emails"]);
}
```

The bridge namespace is `contacts`. The plugin also exports
`ContactsBridgeContracts` for callers that prefer the low-level typed bridge.

## Permissions

iOS generation adds `NSContactsUsageDescription` when the contacts plugin is in
the app config. Android generation adds:

- `android.permission.READ_CONTACTS`
- `android.permission.WRITE_CONTACTS`
- `android.permission.GET_ACCOUNTS`

Call `getContactsPermissionStatus()` before querying contacts. Call
`requestContactsPermissions()` to start the native permission flow where the
platform/runtime supports it.

## Platform Differences

iOS uses the Contacts framework for permission status and contact queries.
Android uses `ContactsContract` for contact queries after `READ_CONTACTS` has
been granted.

Operations that are not supported by the current platform/runtime fail with a
structured JSON error string containing `code`, `message`, `platform`, and
`operation`. The initial implementation documents unsupported operations
explicitly instead of silently no-oping.

## Current Operation Support

| Operation            | iOS | Android |
| -------------------- | --- | ------- |
| Permission status    | Yes | Yes     |
| Permission request   | Yes | No      |
| Query contacts       | Yes | Yes     |
| Native picker        | No  | No      |
| Create/update/delete | No  | No      |
| Groups/containers    | Yes | No      |
| vCard export         | No  | No      |

Unsupported operations return a structured `unsupported` error.
