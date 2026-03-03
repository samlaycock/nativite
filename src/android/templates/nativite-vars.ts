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

            updateVar("--nv-keyboard-height", "\${keyboardHeight}px")
            updateVar("--nv-keyboard-visible", if (keyboardVisible) "1" else "0")
            updateVar("--nv-keyboard-inset", "\${keyboardHeight}px")

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
         * Returns a JS snippet that injects a <style> block with all --nv-*
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
s.textContent=':root{--nv-safe-top:0px;--nv-safe-bottom:0px;--nv-safe-left:0px;--nv-safe-right:0px;--nv-nav-height:0px;--nv-nav-visible:0;--nv-tab-height:0px;--nv-tab-visible:0;--nv-toolbar-height:0px;--nv-toolbar-visible:0;--nv-status-height:0px;--nv-inset-top:0px;--nv-inset-bottom:0px;--nv-inset-left:0px;--nv-inset-right:0px;--nv-keyboard-height:0px;--nv-keyboard-visible:0;--nv-keyboard-inset:0px;--nv-accessory-height:0px;--nv-sidebar-width:0px;--nv-sidebar-visible:0;--nv-sheet-visible:0;--nv-sheet-detent:0;--nv-is-phone:1;--nv-is-tablet:0;--nv-is-desktop:0;--nv-is-portrait:1;--nv-is-landscape:0;--nv-is-dark:0;--nv-is-light:1;--nv-contrast:0;--nv-reduced-motion:0;--nv-reduced-transparency:0;--nv-font-scale:1;}';
document.documentElement.appendChild(s);
window.__nk_patch=function(vars){var r=document.documentElement;for(var k in vars){r.style.setProperty(k,vars[k]);}};
})()"""
    }
}
`;
}
