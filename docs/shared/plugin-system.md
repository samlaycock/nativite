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

Android plugins export a registration function that accepts `NativiteBridge`.
The generated `NativitePluginRegistrant.kt` calls each function from
`platforms.android.registrars`, and `MainActivity` invokes that registrant before
rendering the web view. Registrars in plugin-owned Kotlin packages should include
an `import` path so the generated registrant can compile outside the plugin
package.

```kotlin
fun registerCameraPlugin(bridge: NativiteBridge) {
    bridge.register(namespace = "camera", method = "takePhoto") { args, completion ->
        val quality = (args as? Map<*, *>)?.get("quality") as? Double ?: 1.0
        // ... perform native work ...
        completion(Result.success(mapOf("path" to photoPath)))
    }
}
```

## Calling Plugins (JavaScript)

```javascript
import { bridge } from "nativite/client";

const result = await bridge.call("camera", "takePhoto", { quality: 0.8 });
console.log(result.path); // "/path/to/photo.jpg"
```

## Authoring Plugins

Plugins are ordinary JavaScript or TypeScript modules. They do not need to live
in a monorepo workspace, follow a package-name convention, or be published
before they can be used. A project can import a plugin from any local file:

```ts
// plugins/camera/plugin.ts
import { definePlugin } from "nativite";

interface CameraBridgeContracts {
  camera: {
    methods: {
      takePhoto: {
        params: { readonly quality: number };
        result: { readonly path: string };
      };
    };
    events: {
      "camera.ready": { readonly deviceCount: number };
    };
  };
}

export const cameraPlugin = definePlugin(
  {
    name: "camera",
    contracts: {} as CameraBridgeContracts,
    platforms: {
      ios: {
        sources: ["./ios/CameraPlugin.swift"],
        registrars: ["registerCameraPlugin"],
        dependencies: ["AVFoundation"],
      },
      macos: {
        sources: ["./macos/CameraPlugin.swift"],
        registrars: ["registerCameraPlugin"],
      },
      android: {
        sources: ["./android/CameraPlugin.kt"],
        resources: ["./android/res"],
        registrars: [
          {
            symbol: "registerCameraPlugin",
            import: "com.example.camera.registerCameraPlugin",
          },
        ],
        dependencies: ["androidx.camera:camera-core:1.4.0"],
      },
    },
  },
  import.meta.url,
);
```

The `contracts` field is type-only metadata for TypeScript consumers. It lets
plugin packages export a bridge contract that app code can pass to
`createBridge<Contracts>()`; plugin resolution ignores it at runtime, so native
registration still comes from the `bridge` namespace list and platform
contributions.

```ts
import { createBridge } from "nativite/client";
import { cameraPlugin } from "./plugins/camera/plugin";

type CameraContracts = NonNullable<typeof cameraPlugin.contracts>;

const bridge = createBridge<CameraContracts>();
const photo = await bridge.call("camera", "takePhoto", { quality: 0.8 });
```

```ts
// nativite.config.ts
import { defineConfig, ios } from "nativite";
import { cameraPlugin } from "./plugins/camera/plugin";

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios()],
  plugins: [cameraPlugin],
});
```

Passing `import.meta.url` to `definePlugin` makes relative native file paths
resolve from the plugin module's directory. This is the recommended pattern for
both local in-repo plugins and third-party packages because the consumer does
not need to know where the plugin stores its native files.

Plugins can also set `rootDir` directly:

```ts
definePlugin({
  name: "camera",
  rootDir: "./plugins/camera",
  platforms: {
    ios: { sources: ["./ios/CameraPlugin.swift"] },
  },
});
```

String `rootDir` values are resolved from the app project root. `URL` values
are resolved as file-system paths, so package authors can use
`rootDir: new URL(".", import.meta.url)` if they do not want to use the second
`definePlugin` argument.

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

- Plugins are explicit config entries imported by the app from local files or external packages.
- Relative plugin native file paths are resolved from the plugin `rootDir`; when `definePlugin(..., import.meta.url)` is used, that root is the plugin module directory.
- iOS/macOS generation creates the `NativitePluginRegistrant` file with conditional compilation for each Apple platform.
- Android generation copies plugin sources/resources into generated project-owned directories, adds them to Gradle source sets, emits Gradle dependencies, and creates `NativitePluginRegistrant.kt`.
- Plugin fingerprints are included in the config hash for dirty-check optimization.
