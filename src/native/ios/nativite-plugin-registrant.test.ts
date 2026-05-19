import { describe, expect, it } from "bun:test";

import type { ResolvedNativitePlugins } from "../../plugins/resolve.ts";

import { nativitePluginRegistrantTemplate } from "./nativite-plugin-registrant.ts";

describe("nativitePluginRegistrantTemplate", () => {
  it("registers macOS unsupported stubs for plugin bridge namespaces without macOS native inputs", () => {
    const resolvedPlugins: ResolvedNativitePlugins = {
      plugins: [
        {
          name: "nativite-contacts",
          rootDir: "/tmp/plugins/contacts",
          fingerprint: "contacts",
          bridgeNamespaces: [
            {
              name: "contacts",
              methods: ["requestPermissions", "queryContacts"],
            },
          ],
          platforms: {
            ios: {
              sources: [{ pluginName: "nativite-contacts", absolutePath: "/tmp/Contacts.swift" }],
              resources: [],
              registrars: ["registerNativiteContactsPlugin"],
              dependencies: [],
            },
            macos: {
              sources: [],
              resources: [],
              registrars: [],
              dependencies: [],
            },
            android: {
              sources: [],
              resources: [],
              registrars: [],
              dependencies: [],
            },
          },
        },
      ],
      platforms: {
        ios: {
          sources: [{ pluginName: "nativite-contacts", absolutePath: "/tmp/Contacts.swift" }],
          resources: [],
          registrars: ["registerNativiteContactsPlugin"],
          dependencies: [],
        },
        macos: {
          sources: [],
          resources: [],
          registrars: [],
          dependencies: [],
        },
        android: {
          sources: [],
          resources: [],
          registrars: [],
          dependencies: [],
        },
      },
    };

    const output = nativitePluginRegistrantTemplate(resolvedPlugins);

    expect(output).toContain(
      'registerUnsupportedNativitePluginNamespace(bridge, namespace: "contacts", methods: ["queryContacts", "requestPermissions"])',
    );
    expect(output).toContain('"code": "unsupported"');
    expect(output).toContain('"platform": "macos"');
  });

  it("does not generate macOS unsupported stubs when a plugin contributes macOS native registration", () => {
    const resolvedPlugins: ResolvedNativitePlugins = {
      plugins: [
        {
          name: "nativite-secure-store",
          rootDir: "/tmp/plugins/secure-store",
          fingerprint: "secure-store",
          bridgeNamespaces: [{ name: "secureStore", methods: ["getItem"] }],
          platforms: {
            ios: { sources: [], resources: [], registrars: [], dependencies: [] },
            macos: {
              sources: [{ pluginName: "nativite-secure-store", absolutePath: "/tmp/Secure.swift" }],
              resources: [],
              registrars: ["registerNativiteSecureStorePlugin"],
              dependencies: [],
            },
            android: { sources: [], resources: [], registrars: [], dependencies: [] },
          },
        },
      ],
      platforms: {
        ios: { sources: [], resources: [], registrars: [], dependencies: [] },
        macos: {
          sources: [{ pluginName: "nativite-secure-store", absolutePath: "/tmp/Secure.swift" }],
          resources: [],
          registrars: ["registerNativiteSecureStorePlugin"],
          dependencies: [],
        },
        android: { sources: [], resources: [], registrars: [], dependencies: [] },
      },
    };

    const output = nativitePluginRegistrantTemplate(resolvedPlugins);

    expect(output).toContain("registerNativiteSecureStorePlugin(bridge)");
    expect(output).not.toContain('namespace: "secureStore"');
  });
});
