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
        installSplashScreen()`
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
