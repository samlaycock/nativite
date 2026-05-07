# Plugin System

The plugin system allows third-party native capabilities to be registered on the bridge and called from JavaScript.

## Registering Plugins (Native)

### iOS / macOS (Swift)

Plugins export a registration function:

```swift
func iosPluginNameRegister(on bridge: NativiteBridge) {
    bridge.register(namespace: "camera", method: "takePhoto") { args, completion in
        // Access native APIs
        let quality = (args as? [String: Any])?["quality"] as? Double ?? 1.0
        // ... perform native work ...
        completion(.success(["path": photoPath]))
    }
}
```

The auto-generated `NativitePluginRegistrant.swift` calls all plugin registration functions:

```swift
func registerNativitePlugins(on bridge: NativiteBridge) {
    #if os(iOS)
    cameraPluginRegister(bridge)
    locationPluginRegister(bridge)
    #elseif os(macOS)
    fileSystemPluginRegister(bridge)
    #endif
}
```

### Android (Kotlin)

Android native plugin contributions are not supported yet. A plugin must not
declare `platforms.android.sources`, `resources`, `registrars`, or
`dependencies`; when Android is an enabled platform, plugin resolution fails
before project generation if any of those fields are present. This prevents
Kotlin sources or Gradle dependencies from being silently omitted from the
generated project.

The Android bridge still supports built-in handlers, and generated Android
runtime code can register handlers directly:

Plugins register handlers on the bridge's handler map:

```kotlin
bridge.handlers["camera.takePhoto"] = { args, completion ->
    val quality = (args as? Map<*, *>)?.get("quality") as? Double ?: 1.0
    // ... perform native work ...
    completion(mapOf("path" to photoPath))
}
```

## Calling Plugins (JavaScript)

```javascript
import { bridge } from "nativite/client";

const result = await bridge.call("camera", "takePhoto", { quality: 0.8 });
console.log(result.path); // "/path/to/photo.jpg"
```

## Handler Resolution

Handlers are stored as `"namespace.method"` keys:

- `"camera.takePhoto"`
- `"location.getCurrentPosition"`
- `"fileSystem.readFile"`

This allows O(1) lookup and prevents namespace collisions between plugins.

## Built-in Handlers

| Namespace      | Method                                | Description                                         |
| -------------- | ------------------------------------- | --------------------------------------------------- |
| `__nativite__` | `__ping__`                            | Returns `"pong"`                                    |
| `__nativite__` | `__ota_check__`                       | Returns OTA update status (`available`, `version?`) |
| `__chrome__`   | `__chrome_set_state__`                | Applies chrome state (fire-and-forget)              |
| `__chrome__`   | `__chrome_messaging_post_to_parent__` | Inter-webview messaging                             |
| `__chrome__`   | `__chrome_messaging_post_to_child__`  | Inter-webview messaging                             |
| `__chrome__`   | `__chrome_messaging_broadcast__`      | Inter-webview messaging                             |

## Plugin Resolution

During project generation, plugins are resolved from the config:

- Plugin packages are discovered and their Apple native registration functions identified.
- iOS/macOS generation creates the `NativitePluginRegistrant` file with conditional compilation for each Apple platform.
- Android `platforms.android` native source/resource/registrar/dependency contributions are rejected because Android Gradle inclusion and native registrant generation are not implemented.
- Plugin fingerprints are included in the config hash for dirty-check optimization.
