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

    fun startObserving() {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val keyboardHeight = ime.bottom
            val keyboardVisible = keyboardHeight > 0

            updateVar("--nk-keyboard-height", "\${keyboardHeight}px")
            updateVar("--nk-keyboard-visible", if (keyboardVisible) "1" else "0")
            updateVar("--nk-keyboard-inset", "\${keyboardHeight}px")

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
        val js = buildString {
            append("if(window.__nk_patch){window.__nk_patch({")
            var first = true
            for ((name, value) in lastVars) {
                if (!first) append(",")
                append("\\"$name\\":\\"$value\\"")
                first = false
            }
            append("});}")
        }
        lastVars.clear()
        mainHandler.post {
            webView.evaluateJavascript(js, null)
        }
    }

    companion object {
        /**
         * Returns a JS snippet that injects a <style> block with all --nk-*
         * CSS variable defaults and defines the window.__nk_patch() helper.
         *
         * On Android the native chrome (title bar, navigation bar, toolbar)
         * sits around the WebView in the Compose layout rather than
         * overlapping it, so safe-area and chrome-geometry variables
         * default to 0.
         *
         * Call this from onPageStarted so variables exist before content
         * renders.
         */
        fun buildInitScript(): String = """(function(){
var s=document.createElement('style');
s.id='__nk_vars__';
s.textContent=':root{--nk-safe-top:0px;--nk-safe-bottom:0px;--nk-safe-left:0px;--nk-safe-right:0px;--nk-nav-height:0px;--nk-nav-visible:0;--nk-tab-height:0px;--nk-tab-visible:0;--nk-toolbar-height:0px;--nk-toolbar-visible:0;--nk-status-height:0px;--nk-inset-top:0px;--nk-inset-bottom:0px;--nk-inset-left:0px;--nk-inset-right:0px;--nk-keyboard-height:0px;--nk-keyboard-visible:0;--nk-keyboard-inset:0px;--nk-accessory-height:0px;--nk-sidebar-width:0px;--nk-sidebar-visible:0;--nk-sheet-visible:0;--nk-sheet-detent:0;--nk-is-phone:1;--nk-is-tablet:0;--nk-is-desktop:0;--nk-is-portrait:1;--nk-is-landscape:0;--nk-is-dark:0;--nk-is-light:1;--nk-contrast:0;--nk-reduced-motion:0;--nk-reduced-transparency:0;--nk-font-scale:1;}';
document.documentElement.appendChild(s);
window.__nk_patch=function(vars){var r=document.documentElement;for(var k in vars){r.style.setProperty(k,vars[k]);}};
})()"""
    }
}
`;
}
