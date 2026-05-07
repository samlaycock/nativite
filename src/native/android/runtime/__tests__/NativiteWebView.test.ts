import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const kt = await Bun.file(join(import.meta.dirname, "../NativiteWebView.kt")).text();

describe("NativiteWebView.kt", () => {
  it("uses WebViewAssetLoader for bundled assets", () => {
    expect(kt).toContain("WebViewAssetLoader");
    expect(kt).toContain("AssetsPathHandler");
    expect(kt).toContain("appassets.androidplatform.net");
  });

  it("injects instance name on page start", () => {
    expect(kt).toContain("__nativekit_instance_name__");
    expect(kt).toContain("onPageStarted");
  });

  it("sets data-nv-platform attribute on page start", () => {
    expect(kt).toContain("document.documentElement.setAttribute('data-nv-platform','android')");
  });

  it("reapplies data-nv-platform attribute on page finish for the final document", () => {
    expect(kt).toContain("override fun onPageFinished");
    expect(kt).toContain("SET_PLATFORM_ATTRIBUTE_SCRIPT");
    expect(kt).toContain("view.evaluateJavascript(SET_PLATFORM_ATTRIBUTE_SCRIPT, null)");
  });

  it("injects CSS variable defaults via NativiteVars.buildInitScript on page start", () => {
    expect(kt).toContain("NativiteVars.buildInitScript()");
    expect(kt).toContain("onPageStarted");
  });

  it("attaches bridge on page finish", () => {
    expect(kt).toContain("onPageFinished");
    expect(kt).toContain("bridge.attachWebView(view, instanceName)");
  });

  it("enables JavaScript and DOM storage", () => {
    expect(kt).toContain("javaScriptEnabled = true");
    expect(kt).toContain("domStorageEnabled = true");
  });

  it("handles lifecycle events for pause/resume", () => {
    expect(kt).toContain("ON_PAUSE");
    expect(kt).toContain("ON_RESUME");
    expect(kt).toContain("webView.onPause()");
    expect(kt).toContain("webView.onResume()");
  });

  it("cleans up on dispose", () => {
    expect(kt).toContain("bridge.detachWebView(instanceName)");
    expect(kt).toContain("webView.destroy()");
  });

  it("resolves dev URL from dev.json via getDevUrl", () => {
    expect(kt).toContain("fun getDevUrl(context: Context): String?");
    expect(kt).toContain("if (!BuildConfig.DEBUG) return null");
    expect(kt).toContain("dev.json");
    expect(kt).toContain("devURL");
    expect(kt).toContain("normalizeAndroidDevUrl(devUrl)");
  });

  it("normalizes loopback dev URLs for Android emulator access", () => {
    expect(kt).toContain('private const val ANDROID_EMULATOR_LOOPBACK_HOST = "10.0.2.2"');
    expect(kt).toContain("fun normalizeAndroidDevUrl(devUrl: String): String");
    expect(kt).toContain('host != "localhost"');
    expect(kt).toContain('host != "127.0.0.1"');
    expect(kt).toContain('host != "::1"');
  });

  it("defines PRODUCTION_BASE_URL constant", () => {
    expect(kt).toContain("private const val PRODUCTION_BASE_URL");
    expect(kt).toContain("appassets.androidplatform.net/assets/dist/index.html");
  });

  it("resolves child URLs against dev server in dev mode", () => {
    expect(kt).toContain(
      "fun resolveChildUrl(context: Context, rawUrl: String): Pair<String, String?>",
    );
    expect(kt).toContain("devUrl.trimEnd('/')");
    expect(kt).toContain("Pair(base + path, null)");
  });

  it("returns SPA route for relative URLs in production", () => {
    expect(kt).toContain("Pair(PRODUCTION_BASE_URL, rawUrl)");
  });

  it("passes absolute URLs through unchanged", () => {
    expect(kt).toContain('rawUrl.contains("://")');
    expect(kt).toContain("Pair(rawUrl, null)");
  });

  it("applies SPA route via history.replaceState in onPageFinished", () => {
    expect(kt).toContain("view.tag as? String");
    expect(kt).toContain("history.replaceState(null, '', p.route)");
    expect(kt).toContain("PopStateEvent('popstate')");
  });

  it("emits sheet.loadFailed for sheet main-frame load errors", () => {
    expect(kt).toContain("override fun onReceivedError(");
    expect(kt).toContain("override fun onReceivedHttpError(");
    expect(kt).toContain('"sheet.loadFailed"');
    expect(kt).toContain('"name" to instanceName');
  });

  it("emits tabBottomAccessory.loadFailed for tab accessory load errors", () => {
    expect(kt).toContain('"tabBottomAccessory.loadFailed"');
  });

  it("uses resolveChildUrl for non-null url in DisposableEffect", () => {
    expect(kt).toContain("val (loadUrl, spaRoute) = resolveChildUrl(context, url)");
    expect(kt).toContain("webView.tag = spaRoute");
  });

  it("enables WebView debugging in debug builds", () => {
    expect(kt).toContain("setWebContentsDebuggingEnabled");
    expect(kt).toContain("BuildConfig.DEBUG");
  });

  it("disables algorithmic darkening so CSS-controlled dark mode is not overridden", () => {
    expect(kt).toContain("isAlgorithmicDarkeningAllowed = false");
    expect(kt).not.toContain("isAlgorithmicDarkeningAllowed = true");
  });

  it("prevents parent scroll interception for child webviews (sheets, drawers, etc.)", () => {
    expect(kt).toContain("requestDisallowInterceptTouchEvent(true)");
    expect(kt).toContain("chromeArea != null");
    expect(kt).toContain("MotionEvent.ACTION_DOWN");
  });

  it("sets child webview background to transparent so parent container color shows through while loading", () => {
    expect(kt).toContain("setBackgroundColor(android.graphics.Color.TRANSPARENT)");
    expect(kt).toContain("chromeArea != null");
  });
});
