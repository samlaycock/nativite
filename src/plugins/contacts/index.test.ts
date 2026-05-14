import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { resolveNativitePlugins } from "../resolve.ts";
import { contacts } from "./index.ts";

function makeConfig(): NativiteConfig {
  return {
    app: {
      name: "ContactsApp",
      bundleId: "com.example.contacts",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "android", minSdk: 26 },
    ],
    plugins: [contacts],
  };
}

describe("contacts plugin", () => {
  it("exposes the first-party contacts plugin metadata", () => {
    expect(contacts.name).toBe("nativite-contacts");
    expect(contacts.bridge?.namespaces?.[0]?.name).toBe("contacts");
    expect(contacts.bridge?.namespaces?.[0]?.methods).toContain("queryContacts");
  });

  it("resolves iOS and Android native contributions", async () => {
    const resolved = await resolveNativitePlugins(makeConfig(), process.cwd(), "generate");

    expect(
      resolved.platforms.ios.sources.some((source) =>
        source.absolutePath.includes("src/plugins/contacts/ios/NativiteContactsPlugin.swift"),
      ),
    ).toBe(true);
    expect(resolved.platforms.ios.registrars).toContain("registerNativiteContactsPlugin");
    expect(resolved.platforms.ios.dependencies).toEqual([{ name: "Contacts", weak: false }]);
    expect(
      resolved.platforms.android.sources.some((source) =>
        source.absolutePath.includes("src/plugins/contacts/android/NativiteContactsPlugin.kt"),
      ),
    ).toBe(true);
    expect(resolved.platforms.android.registrars).toContain(
      "dev.nativite.plugins.contacts.registerNativiteContactsPlugin",
    );
  });

  it("does not advertise unsupported Android runtime permission requests", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/contacts/android/NativiteContactsPlugin.kt"),
      "utf-8",
    );

    expect(source).toContain('if (granted) "granted" else "denied"');
    expect(source).toContain('"canAskAgain" to false');
    expect(source).toContain('unsupported("requestPermissions")');
  });

  it("honors iOS field selection and page size in the native query implementation", () => {
    const source = readFileSync(
      join(process.cwd(), "src/plugins/contacts/ios/NativiteContactsPlugin.swift"),
      "utf-8",
    );

    expect(source).not.toContain("ContactsUI");
    expect(source).toContain("private func requestedFields(_ args: Any?) -> Set<String>");
    expect(source).toContain("private func requestedPageSize(_ args: Any?) -> Int");
    expect(source).toContain("contactDictionary(contact, fields: fields)");
    expect(source).toContain("if contacts.count >= pageSize");
  });
});
