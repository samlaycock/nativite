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

  it("resolves dev URL from dev.json", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("dev.json");
    expect(output).toContain("devURL");
  });

  it("enables WebView debugging in debug builds", () => {
    const output = nativiteWebViewTemplate(androidConfig);
    expect(output).toContain("setWebContentsDebuggingEnabled");
    expect(output).toContain("FLAG_DEBUGGABLE");
  });
});
