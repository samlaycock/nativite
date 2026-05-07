import android.R.attr.colorAccent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import java.util.Locale

class NativiteVars(private val webView: WebView, private val bridge: NativiteBridge? = null) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var lastVars = mutableMapOf<String, String>()
    private var lastAttrs = mutableMapOf<String, String>()

    fun startObserving() {
        updateEnvironmentVars()
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            updateEnvironmentVars()
            updateInsetVars(insets)
            flush()
            insets
        }
        ViewCompat.setWindowInsetsAnimationCallback(
            webView,
            object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onProgress(
                    insets: WindowInsetsCompat,
                    runningAnimations: MutableList<WindowInsetsAnimationCompat>,
                ): WindowInsetsCompat {
                    updateEnvironmentVars()
                    val imeAnimation = runningAnimations.lastOrNull { animation ->
                        animation.typeMask and WindowInsetsCompat.Type.ime() != 0
                    }
                    updateInsetVars(
                        insets,
                        keyboardDurationMs = imeAnimation?.durationMillis ?: 250L,
                        keyboardCurve = "ease-in-out",
                    )
                    flush()
                    return insets
                }
            },
        )
        webView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            updateEnvironmentVars()
            flush()
        }
        ViewCompat.requestApplyInsets(webView)
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

    fun updateAttr(name: String, value: String) {
        if (lastAttrs[name] != value) {
            lastAttrs[name] = value
        }
    }

    private fun flush() {
        if (lastVars.isEmpty() && lastAttrs.isEmpty()) return
        val js = buildString {
            append("if(window.__nv_patch){window.__nv_patch({")
            var first = true
            for ((name, value) in lastVars) {
                if (!first) append(",")
                append("\"$name\":\"$value\"")
                first = false
            }
            if (lastAttrs.isNotEmpty()) {
                append("},{")
                first = true
                for ((name, value) in lastAttrs) {
                    if (!first) append(",")
                    append("\"$name\":\"$value\"")
                    first = false
                }
                append("})")
            } else {
                append("})")
            }
            append(";}")
        }
        lastVars.clear()
        lastAttrs.clear()
        mainHandler.post {
            webView.evaluateJavascript(js, null)
        }
    }

    private fun updateEnvironmentVars() {
        val config = webView.resources.configuration
        val isTablet = config.smallestScreenWidthDp >= 600
        val isPortrait = when (config.orientation) {
            Configuration.ORIENTATION_LANDSCAPE -> false
            Configuration.ORIENTATION_PORTRAIT -> true
            else -> webView.height >= webView.width
        }
        val isDark = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val density = webView.resources.displayMetrics.density
        val compactWidthDp = if (config.screenWidthDp != Configuration.SCREEN_WIDTH_DP_UNDEFINED) {
            config.screenWidthDp
        } else {
            (webView.resources.displayMetrics.widthPixels / density).toInt()
        }
        val accentColor = webView.context.obtainStyledAttributes(intArrayOf(colorAccent)).let { attrs ->
            try {
                attrs.getColor(0, Color.rgb(0, 122, 255))
            } finally {
                attrs.recycle()
            }
        }
        val fontScale = config.fontScale

        updateVar("--nv-is-phone", if (isTablet) "0" else "1")
        updateVar("--nv-is-tablet", if (isTablet) "1" else "0")
        updateVar("--nv-is-desktop", "0")
        updateVar("--nv-is-portrait", if (isPortrait) "1" else "0")
        updateVar("--nv-is-landscape", if (isPortrait) "0" else "1")
        updateVar("--nv-display-scale", formatNumber(density))
        updateVar("--nv-display-corner", "0px")
        updateVar("--nv-nav-depth", "0")
        updateVar("--nv-title-collapse", "0")
        updateVar("--nv-pop-gesture", "0")
        updateVar("--nv-sheet-visible", "0")
        updateVar("--nv-sheet-detent", "0")
        updateVar("--nv-is-compact-width", if (compactWidthDp < 600) "1" else "0")
        updateVar("--nv-split-fraction", "1")
        updateVar("--nv-is-dark", if (isDark) "1" else "0")
        updateVar("--nv-is-light", if (isDark) "0" else "1")
        updateVar("--nv-contrast", "0")
        updateVar("--nv-reduced-motion", "0")
        updateVar("--nv-reduced-transparency", "0")
        updateVar("--nv-accent-r", Color.red(accentColor).toString())
        updateVar("--nv-accent-g", Color.green(accentColor).toString())
        updateVar("--nv-accent-b", Color.blue(accentColor).toString())
        updateVar(
            "--nv-accent",
            "rgb(${Color.red(accentColor)},${Color.green(accentColor)},${Color.blue(accentColor)})",
        )
        updateVar("--nv-font-scale", formatNumber(fontScale))
        updateVar("--nv-font-body", fontPx(17f, fontScale))
        updateVar("--nv-font-callout", fontPx(16f, fontScale))
        updateVar("--nv-font-caption1", fontPx(12f, fontScale))
        updateVar("--nv-font-caption2", fontPx(11f, fontScale))
        updateVar("--nv-font-footnote", fontPx(13f, fontScale))
        updateVar("--nv-font-headline", fontPx(17f, fontScale))
        updateVar("--nv-font-subheadline", fontPx(15f, fontScale))
        updateVar("--nv-font-title1", fontPx(28f, fontScale))
        updateVar("--nv-font-title2", fontPx(22f, fontScale))
        updateVar("--nv-font-title3", fontPx(20f, fontScale))
        updateVar("--nv-font-largeTitle", fontPx(34f, fontScale))
        updateAttr("data-nv-theme", if (isDark) "dark" else "light")
    }

    private fun updateInsetVars(
        insets: WindowInsetsCompat,
        keyboardDurationMs: Long = 250L,
        keyboardCurve: String = "ease-in-out",
    ) {
        val safeInsets = insets.getInsets(
            WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
        )
        val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
        val keyboardHeight = imeInsets.bottom
        val keyboardVisible = keyboardHeight > 0

        updateVar("--nv-safe-top", "${safeInsets.top}px")
        updateVar("--nv-safe-bottom", "${safeInsets.bottom}px")
        updateVar("--nv-safe-left", "${safeInsets.left}px")
        updateVar("--nv-safe-right", "${safeInsets.right}px")
        updateVar("--nv-status-height", "${safeInsets.top}px")
        updateVar("--nv-inset-top", "0px")
        updateVar("--nv-inset-bottom", "0px")
        updateVar("--nv-inset-left", "0px")
        updateVar("--nv-inset-right", "0px")
        updateVar("--nv-keyboard-height", "${keyboardHeight}px")
        updateVar("--nv-keyboard-visible", if (keyboardVisible) "1" else "0")
        updateVar("--nv-keyboard-floating", "0")
        updateVar("--nv-keyboard-inset", "${keyboardHeight}px")
        updateVar("--nv-keyboard-duration", "${keyboardDurationMs}ms")
        updateVar("--nv-keyboard-curve", keyboardCurve)
        updateVar("--nv-accessory-height", "0px")
    }

    private fun fontPx(basePx: Float, fontScale: Float): String {
        return String.format(Locale.US, "%.1fpx", basePx * fontScale)
    }

    private fun formatNumber(value: Float): String {
        val rounded = String.format(Locale.US, "%.2f", value)
        return rounded.trimEnd('0').trimEnd('.')
    }

    companion object {
        /**
         * Returns a JS snippet that injects a <style> block with all --nv-*
         * CSS variable defaults and defines the window.__nv_patch() helper.
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
s.id='__nv_vars__';
s.textContent=':root{color-scheme:light dark;--nv-safe-top:0px;--nv-safe-bottom:0px;--nv-safe-left:0px;--nv-safe-right:0px;--nv-nav-height:0px;--nv-nav-visible:0;--nv-tab-height:0px;--nv-tab-visible:0;--nv-toolbar-height:0px;--nv-toolbar-visible:0;--nv-status-height:0px;--nv-inset-top:0px;--nv-inset-bottom:0px;--nv-inset-left:0px;--nv-inset-right:0px;--nv-keyboard-height:0px;--nv-keyboard-visible:0;--nv-keyboard-floating:0;--nv-keyboard-inset:0px;--nv-keyboard-duration:250ms;--nv-keyboard-curve:ease-in-out;--nv-accessory-height:0px;--nv-nav-depth:0;--nv-title-collapse:0;--nv-pop-gesture:0;--nv-sheet-visible:0;--nv-sheet-detent:0;--nv-display-scale:2;--nv-display-corner:0px;--nv-is-phone:1;--nv-is-tablet:0;--nv-is-desktop:0;--nv-is-portrait:1;--nv-is-landscape:0;--nv-is-compact-width:0;--nv-split-fraction:1;--nv-is-dark:0;--nv-is-light:1;--nv-contrast:0;--nv-reduced-motion:0;--nv-reduced-transparency:0;--nv-accent-r:0;--nv-accent-g:122;--nv-accent-b:255;--nv-accent:rgb(var(--nv-accent-r),var(--nv-accent-g),var(--nv-accent-b));--nv-font-scale:1;--nv-font-body:17px;--nv-font-callout:16px;--nv-font-caption1:12px;--nv-font-caption2:11px;--nv-font-footnote:13px;--nv-font-headline:17px;--nv-font-subheadline:15px;--nv-font-title1:28px;--nv-font-title2:22px;--nv-font-title3:20px;--nv-font-largeTitle:34px;}';
document.documentElement.appendChild(s);
window.__nv_patch=function(vars,attrs){var r=document.documentElement;for(var k in vars){r.style.setProperty(k,vars[k]);}if(attrs){for(var k in attrs){r.setAttribute(k,attrs[k]);}}};
document.documentElement.setAttribute('data-nv-theme','light');
})()"""
    }
}
