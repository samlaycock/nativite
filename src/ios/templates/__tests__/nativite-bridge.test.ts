import { describe, expect, it } from "bun:test";

import { baseConfig } from "../../../__tests__/fixtures.ts";
import { nativiteBridgeTemplate } from "../nativite-bridge.ts";

describe("nativiteBridgeTemplate", () => {
  it("scopes chrome mutations to the primary webview", () => {
    const output = nativiteBridgeTemplate(baseConfig);

    expect(output).toContain("weak var primaryWebView: WKWebView?");
    expect(output).toContain(
      "private func isMessageFromPrimaryWebView(_ message: WKScriptMessage) -> Bool",
    );
    expect(output).toContain("guard isMessageFromPrimaryWebView(message) else {");
    expect(output).toContain("guard let sourceWebView = message.webView else { return true }");
    expect(output).toContain("return sourceWebView === primaryWebView");
  });

  it("handles post_to_parent messaging from child webviews", () => {
    const output = nativiteBridgeTemplate(baseConfig);

    expect(output).toContain(
      'if namespace == "__chrome__" && method == "__chrome_messaging_post_to_parent__" {',
    );
    expect(output).toContain("if !isMessageFromPrimaryWebView(message) {");
    expect(output).toContain("let fromName = chrome.instanceName(for: message.webView)");
    expect(output).toContain(
      'chrome.sendEvent(name: "message", data: ["from": fromName, "payload": body["args"] ?? NSNull()])',
    );
  });

  it("handles post_to_child messaging from the primary webview", () => {
    const output = nativiteBridgeTemplate(baseConfig);

    expect(output).toContain(
      'if namespace == "__chrome__" && method == "__chrome_messaging_post_to_child__" {',
    );
    expect(output).toContain('chrome.postMessageToChild(name: name, payload: args["payload"])');
  });

  it("handles broadcast messaging from any webview", () => {
    const output = nativiteBridgeTemplate(baseConfig);

    expect(output).toContain(
      'if namespace == "__chrome__" && method == "__chrome_messaging_broadcast__" {',
    );
    expect(output).toContain('chrome.broadcastMessage(from: fromName, payload: body["args"])');
  });
});
