import type { NativiteConfig } from "../../index.ts";

export function mainActivityTemplate(config: NativiteConfig): string {
  const pkg = config.app.bundleId;
  const hasSplash = config.splash !== undefined;

  return `package ${pkg}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge${
    hasSplash
      ? `
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen`
      : ""
  }

class MainActivity : ComponentActivity() {
    private val bridge = NativiteBridge()

    override fun onCreate(savedInstanceState: Bundle?) {${
      hasSplash
        ? `
        // Keep the OS splash screen visible until the webview finishes loading
        // (or until chrome.splash.hide() is called from JS).
        bridge.splashKeepOnScreen.value = true
        installSplashScreen().setKeepOnScreenCondition { bridge.splashKeepOnScreen.value }`
        : ""
    }
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // Apply default chrome state if configured
        bridge.getDefaultChromeState()?.let { defaultState ->
            bridge.chromeState.value = defaultState
        }

        setContent {
            NativiteTheme {
                NativiteApp(bridge = bridge)
            }
        }
    }
}
`;
}
