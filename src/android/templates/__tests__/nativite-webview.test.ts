import { describe, expect, it } from "bun:test";

import { androidConfig } from "../../../__tests__/fixtures.ts";
import { nativiteWebViewTemplate } from "../nativite-webview.ts";

describe("nativiteWebViewTemplate", () => {
  it("uses the correct package name", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("package com.example.testapp");
  });

  it("uses WebViewAssetLoader for bundled assets", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("WebViewAssetLoader");
    expect(output).toContain("AssetsPathHandler");
    expect(output).toContain("appassets.androidplatform.net");
  });

  it("injects instance name on page start", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("__nativekit_instance_name__");
    expect(output).toContain("onPageStarted");
  });

  it("sets data-nv-platform attribute on page start", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("document.documentElement.setAttribute('data-nv-platform','android')");
  });

  it("injects CSS variable defaults via NativiteVars.buildInitScript on page start", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("NativiteVars.buildInitScript()");
    expect(output).toContain("onPageStarted");
  });

  it("attaches bridge on page finish", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("onPageFinished");
    expect(output).toContain("bridge.attachWebView(view, instanceName)");
  });

  it("enables JavaScript and DOM storage", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("javaScriptEnabled = true");
    expect(output).toContain("domStorageEnabled = true");
  });

  it("handles lifecycle events for pause/resume", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("ON_PAUSE");
    expect(output).toContain("ON_RESUME");
    expect(output).toContain("webView.onPause()");
    expect(output).toContain("webView.onResume()");
  });

  it("cleans up on dispose", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("bridge.detachWebView(instanceName)");
    expect(output).toContain("webView.destroy()");
  });

  it("resolves dev URL from dev.json via getDevUrl", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("fun getDevUrl(context: Context): String?");
    expect(output).toContain("dev.json");
    expect(output).toContain("devURL");
  });

  it("defines PRODUCTION_BASE_URL constant", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("private const val PRODUCTION_BASE_URL");
    expect(output).toContain("appassets.androidplatform.net/assets/dist/index.html");
  });

  it("resolves child URLs against dev server in dev mode", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain(
      "fun resolveChildUrl(context: Context, rawUrl: String): Pair<String, String?>",
    );
    expect(output).toContain("devUrl.trimEnd('/')");
    expect(output).toContain("Pair(base + path, null)");
  });

  it("returns SPA route for relative URLs in production", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("Pair(PRODUCTION_BASE_URL, rawUrl)");
  });

  it("passes absolute URLs through unchanged", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain('rawUrl.contains("://")');
    expect(output).toContain("Pair(rawUrl, null)");
  });

  it("applies SPA route via history.replaceState in onPageFinished", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("view.tag as? String");
    expect(output).toContain("history.replaceState(null, '', p.route)");
    expect(output).toContain("PopStateEvent('popstate')");
  });

  it("uses resolveChildUrl for non-null url in DisposableEffect", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("val (loadUrl, spaRoute) = resolveChildUrl(context, url)");
    expect(output).toContain("webView.tag = spaRoute");
  });

  it("enables WebView debugging in debug builds", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("setWebContentsDebuggingEnabled");
    expect(output).toContain("FLAG_DEBUGGABLE");
  });
});
