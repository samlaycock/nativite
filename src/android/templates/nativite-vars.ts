import type { NativiteConfig } from "../../index.ts";

export function nativiteVarsTemplate(config: NativiteConfig): string {
  const pkg = config.app.bundleId;

  return `package ${pkg}

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class NativiteVars(private val webView: WebView, private val bridge: NativiteBridge? = null) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var lastVars = mutableMapOf<String, String>()
    private var lastSafeArea: Map<String, Int>? = null

    fun startObserving() {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())

            updateVar("--nk-safe-area-top", "\${systemBars.top}px")
            updateVar("--nk-safe-area-bottom", "\${systemBars.bottom}px")
            updateVar("--nk-safe-area-left", "\${systemBars.left}px")
            updateVar("--nk-safe-area-right", "\${systemBars.right}px")
            updateVar("--nk-keyboard-height", "\${ime.bottom}px")

            // Fire safeArea.changed event when insets change
            val currentSafeArea = mapOf(
                "top" to systemBars.top,
                "right" to systemBars.right,
                "bottom" to systemBars.bottom,
                "left" to systemBars.left,
            )
            if (currentSafeArea != lastSafeArea) {
                lastSafeArea = currentSafeArea
                bridge?.sendEventToPrimary("safeArea.changed", currentSafeArea)
            }

            flush()
            insets
        }
    }

    fun updateVar(name: String, value: String) {
        if (lastVars[name] != value) {
            lastVars[name] = value
        }
    }

    fun pushCustomVars(vars: Map<String, String>) {
        for ((name, value) in vars) {
            updateVar(name, value)
        }
        flush()
    }

    private fun flush() {
        if (lastVars.isEmpty()) return
        val statements = lastVars.entries.joinToString("; ") { (name, value) ->
            "document.documentElement.style.setProperty('$name', '$value')"
        }
        mainHandler.post {
            webView.evaluateJavascript(statements, null)
        }
    }
}
`;
}
