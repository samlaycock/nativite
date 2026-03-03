import { describe, expect, it } from "bun:test";

import { androidChromeConfig, androidConfig } from "../../../__tests__/fixtures.ts";
import { nativiteBridgeTemplate } from "../nativite-bridge.ts";

describe("nativiteBridgeTemplate", () => {
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

  it("pushes chrome geometry CSS vars on state update", () => {
    const output = nativiteBridgeTemplate(androidConfig);
    expect(output).toContain("pushChromeGeometryVars(state)");
    expect(output).toContain("--nk-nav-height");
    expect(output).toContain("--nk-tab-height");
    expect(output).toContain("--nk-toolbar-height");
    expect(output).toContain("--nk-nav-visible");
    expect(output).toContain("--nk-tab-visible");
    expect(output).toContain("--nk-toolbar-visible");
  });
});
