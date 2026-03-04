import type { NativiteConfig } from "../../index.ts";

export function nativiteWebViewTemplate(config: NativiteConfig): string {
  const pkg = config.app.bundleId;

  return `package ${pkg}

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.webkit.WebViewAssetLoader

private const val PRODUCTION_BASE_URL = "https://appassets.androidplatform.net/assets/dist/index.html"
private const val SET_PLATFORM_ATTRIBUTE_SCRIPT = "document.documentElement.setAttribute('data-nv-platform','android');"

@SuppressLint("SetJavaScriptEnabled")
fun createNativiteWebView(
    context: Context,
    bridge: NativiteBridge,
    instanceName: String = "main",
    chromeArea: String? = null,
): WebView {
    val webView = WebView(context).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.userAgentString = settings.userAgentString + " Nativite/android/1.0"

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            settings.isAlgorithmicDarkeningAllowed = true
        }
    }

    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

    val assetLoader = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    webView.webViewClient = object : WebViewClient() {
        var didReportLoadFailure = false

        fun reportLoadFailure(message: String, code: Int) {
            if (didReportLoadFailure) return
            didReportLoadFailure = true

            when (chromeArea) {
                "sheet" -> bridge.sendEventToPrimary(
                    "sheet.loadFailed",
                    mapOf(
                        "name" to instanceName,
                        "message" to message,
                        "code" to code,
                    ),
                )
                "tabBottomAccessory" -> bridge.sendEventToPrimary(
                    "tabBottomAccessory.loadFailed",
                    mapOf(
                        "message" to message,
                        "code" to code,
                    ),
                )
            }
        }

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? {
            return assetLoader.shouldInterceptRequest(request.url)
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)
            didReportLoadFailure = false
            // Inject instance name, platform attribute, and CSS variable
            // defaults as early as possible so CSS selectors like
            // [data-nv-platform="android"] and var(--nv-*) work before
            // content renders.
            view.evaluateJavascript(
                "window.__nativekit_instance_name__ = '\${instanceName}';" +
                SET_PLATFORM_ATTRIBUTE_SCRIPT +
                NativiteVars.buildInitScript(),
                null,
            )
        }

        override fun onPageFinished(view: WebView, url: String?) {
            super.onPageFinished(view, url)
            // Reapply platform attribute on the final document after
            // navigation commits so it is visible in DevTools and available
            // to runtime selectors.
            view.evaluateJavascript(SET_PLATFORM_ATTRIBUTE_SCRIPT, null)
            // Attach the bridge port after page load
            bridge.attachWebView(view, instanceName)
            // Apply pending SPA route for child webviews in production
            (view.tag as? String)?.let { route ->
                view.tag = null
                val payload = org.json.JSONObject().apply { put("route", route) }
                view.evaluateJavascript(
                    "(() => { var p = \${payload}; try { history.replaceState(null, '', p.route); dispatchEvent(new PopStateEvent('popstate')); } catch(e){} })();",
                    null,
                )
            }
            // Check if JS called chrome.splash.preventAutoHide() during page
            // load. If not, dismiss the splash screen automatically.
            if (instanceName == "main") {
                view.evaluateJavascript("window.__nativite_splash_prevent_auto_hide__ === true") { result ->
                    if (result != "true") {
                        bridge.splashKeepOnScreen.value = false
                    }
                }
            }
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            super.onReceivedError(view, request, error)
            if (!request.isForMainFrame) return
            reportLoadFailure(
                message = error.description?.toString() ?: "Load failed",
                code = error.errorCode,
            )
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            super.onReceivedHttpError(view, request, errorResponse)
            if (!request.isForMainFrame) return
            reportLoadFailure(
                message = errorResponse.reasonPhrase ?: "HTTP \${errorResponse.statusCode}",
                code = errorResponse.statusCode,
            )
        }
    }

    webView.webChromeClient = WebChromeClient()

    return webView
}

@Composable
fun NativiteWebView(
    bridge: NativiteBridge,
    modifier: Modifier = Modifier,
    instanceName: String = "main",
    chromeArea: String? = null,
    url: String? = null,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val webView = remember {
        createNativiteWebView(context, bridge, instanceName, chromeArea)
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> webView.onPause()
                Lifecycle.Event.ON_RESUME -> webView.onResume()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            bridge.detachWebView(instanceName)
            webView.destroy()
        }
    }

    // Load content
    DisposableEffect(url) {
        if (url != null) {
            val (loadUrl, spaRoute) = resolveChildUrl(context, url)
            webView.tag = spaRoute
            webView.loadUrl(loadUrl)
        } else {
            webView.tag = null
            webView.loadUrl(resolveContentUrl(context))
        }
        onDispose {}
    }

    AndroidView(
        factory = { webView },
        modifier = modifier,
    )
}

private fun getDevUrl(context: Context): String? {
    if (!BuildConfig.DEBUG) return null
    try {
        val devJson = context.assets.open("dev.json").bufferedReader().readText()
        val parsed = org.json.JSONObject(devJson)
        val devUrl = parsed.optString("devURL", "")
        if (devUrl.isNotEmpty()) return devUrl
    } catch (_: Exception) {}
    return null
}

private fun resolveContentUrl(context: Context): String {
    return getDevUrl(context) ?: PRODUCTION_BASE_URL
}

private fun resolveChildUrl(context: Context, rawUrl: String): Pair<String, String?> {
    // Already absolute — use as-is
    if (rawUrl.contains("://")) return Pair(rawUrl, null)

    val devUrl = getDevUrl(context)
    if (devUrl != null) {
        // Dev: resolve path against dev server URL
        val base = devUrl.trimEnd('/')
        val path = if (rawUrl.startsWith("/")) rawUrl else "/$rawUrl"
        return Pair(base + path, null)
    }

    // Production: load SPA entry point, navigate client-side after load
    return Pair(PRODUCTION_BASE_URL, rawUrl)
}
`;
}
