import type { NativiteConfig } from "../../index.ts";

export function nativiteWebViewTemplate(config: NativiteConfig): string {
  const pkg = config.app.bundleId;

  return `package ${pkg}

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.webkit.WebChromeClient
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

@SuppressLint("SetJavaScriptEnabled")
fun createNativiteWebView(
    context: Context,
    bridge: NativiteBridge,
    instanceName: String = "main",
): WebView {
    val webView = WebView(context).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.allowFileAccess = false
        settings.allowContentAccess = false

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            settings.isAlgorithmicDarkeningAllowed = true
        }
    }

    WebView.setWebContentsDebuggingEnabled(
        context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0
    )

    val assetLoader = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    webView.webViewClient = object : WebViewClient() {
        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? {
            return assetLoader.shouldInterceptRequest(request.url)
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)
            // Inject instance name so the JS bridge knows which webview this is
            view.evaluateJavascript(
                "window.__nativekit_instance_name__ = '\${instanceName}';",
                null,
            )
        }

        override fun onPageFinished(view: WebView, url: String?) {
            super.onPageFinished(view, url)
            // Attach the bridge port after page load
            bridge.attachWebView(view, instanceName)
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
    url: String? = null,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val webView = remember {
        createNativiteWebView(context, bridge, instanceName)
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

    // Load content once
    DisposableEffect(url) {
        val targetUrl = url ?: resolveContentUrl(context)
        webView.loadUrl(targetUrl)
        onDispose {}
    }

    AndroidView(
        factory = { webView },
        modifier = modifier,
    )
}

private fun resolveContentUrl(context: Context): String {
    // Check for dev URL in assets/dev.json
    try {
        val devJson = context.assets.open("dev.json").bufferedReader().readText()
        val parsed = org.json.JSONObject(devJson)
        val devUrl = parsed.optString("devURL", "")
        if (devUrl.isNotEmpty()) return devUrl
    } catch (_: Exception) {
        // No dev.json — use bundled assets
    }

    return "https://appassets.androidplatform.net/assets/dist/index.html"
}
`;
}
