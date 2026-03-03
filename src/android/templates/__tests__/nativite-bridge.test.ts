import { describe, expect, it } from "bun:test";

import { androidChromeConfig, androidConfig } from "../../../__tests__/fixtures.ts";
import { nativiteBridgeTemplate } from "../nativite-bridge.ts";

describe("nativiteBridgeTemplate", () => {
  it("registers built-in __nativite__ handlers for ping and OTA status", () => {
    const output = nativiteBridgeTemplate(androidConfig);

    expect(output).toContain("init {");
    expect(output).toContain("registerBuiltinHandlers()");
    expect(output).toContain('register(namespace = "__nativite__", method = "__ping__")');
    expect(output).toContain('register(namespace = "__nativite__", method = "__ota_check__")');
    expect(output).not.toContain('register(namespace: "__nativite__", method: "__ping__")');
    expect(output).not.toContain('register(namespace: "__nativite__", method: "__ota_check__")');
    expect(output).toContain('completion(Result.success(mapOf("available" to false)))');
  });

  it("uses the correct package name", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("package com.example.testapp");
  });

  it("uses WebMessagePort for bridge communication", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("WebMessagePortCompat");
    expect(output).toContain("WebViewCompat.createWebMessageChannel");
    expect(output).toContain("WebViewCompat.postWebMessage");
  });

  it("handles chrome setState messages", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain('namespace == "__chrome__" && method == "__chrome_set_state__"');
    expect(output).toContain("chromeState.value = state");
  });

  it("handles inter-webview messaging", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("__chrome_messaging_post_to_parent__");
    expect(output).toContain("__chrome_messaging_post_to_child__");
    expect(output).toContain("__chrome_messaging_broadcast__");
  });

  it("tracks primary and child webviews", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("primaryWebView");
    expect(output).toContain("childWebViews");
  });

  it("supports native event dispatch", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("fun sendEvent(webView: WebView, name: String, data: Any?)");
    expect(output).toContain("window.nativiteReceive(");
  });

  it("embeds default chrome state when configured", () => {
    const output = nativiteBridgeTemplate(androidChromeConfig);
    expect(output).toContain("titleBar");
    expect(output).toContain("Home");
  });

  it("sets default chrome state to null when not configured", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("val json: String = null ?: return null");
  });

  it("converts event data to JSON-safe types via toJsonValue", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("fun toJsonValue(value: Any?): Any");
    expect(output).toContain("is Map<*, *> -> mapToJsonObject(value)");
    expect(output).toContain("is List<*> -> listToJsonArray(value)");
  });

  it("uses toJsonValue in sendEvent", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain('put("data", toJsonValue(data))');
  });

  it("types sendEventToPrimary data parameter as Map", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("fun sendEventToPrimary(name: String, data: Map<String, Any?>?)");
  });

  it("creates NativiteVars when primary webview is attached", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("primaryVars = NativiteVars(webView, this)");
    expect(output).toContain("it.startObserving()");
  });

  it("pushes chrome geometry CSS vars from rendered measurements", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("fun updateRenderedChromeGeometry(");
    expect(output).toContain("navHeightPx: Int");
    expect(output).toContain("tabHeightPx: Int");
    expect(output).toContain("toolbarHeightPx: Int");
    expect(output).toContain("--nv-nav-height");
    expect(output).toContain("--nv-tab-height");
    expect(output).toContain("--nv-toolbar-height");
    expect(output).toContain("--nv-nav-visible");
    expect(output).toContain("--nv-tab-visible");
    expect(output).toContain("--nv-toolbar-visible");
    expect(output).not.toContain("val navHeight = if (titleBarVisible) 64 else 0");
    expect(output).not.toContain("val tabHeight = if (navVisible) 80 else 0");
    expect(output).not.toContain(
      "val toolbarHeight = if (toolbarVisible && !navVisible) 80 else 0",
    );
  });
});
