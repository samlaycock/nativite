# First-Party Plugin Platform Support

This matrix defines the 1.0 support contract for first-party plugins. A supported platform
contributes a native implementation. An unsupported platform still registers the plugin namespace
when the platform is generated, but each method rejects with a structured `unsupported` error.

| Plugin             | iOS       | macOS            | Android   |
| ------------------ | --------- | ---------------- | --------- |
| App Integrity      | Supported | Unsupported stub | Supported |
| Calendar           | Supported | Unsupported stub | Supported |
| Capture Protection | Supported | Unsupported stub | Supported |
| Contacts           | Supported | Unsupported stub | Supported |
| Haptics            | Supported | Unsupported stub | Supported |
| Local Auth         | Supported | Unsupported stub | Supported |
| Notifications      | Supported | Unsupported stub | Supported |
| Secure Store       | Supported | Supported        | Supported |
| System Controls    | Supported | Unsupported stub | Supported |

## Unsupported Platform Errors

Generated macOS projects register unsupported stubs for first-party plugin namespaces that expose a
JavaScript API but do not ship macOS native code. Calls reject with a JSON-encoded native error that
the JavaScript bridge normalizes into `NativiteBridgeError`.

The native payload includes:

| Field       | Value                                         |
| ----------- | --------------------------------------------- |
| `code`      | `unsupported`                                 |
| `message`   | Human-readable `<namespace>.<method>` message |
| `platform`  | `macos`                                       |
| `operation` | The method name that was called               |

This avoids missing-handler failures for configured first-party plugins while making unsupported
platform behavior explicit and stable.
