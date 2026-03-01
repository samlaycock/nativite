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
    expect(output).toContain("val json = null ?: return null");
  });
});
