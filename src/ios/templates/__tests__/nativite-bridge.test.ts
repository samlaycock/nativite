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

  it("routes sheet-context chrome.sheet.postMessage fallback to sheet.message host events", () => {
    const output = nativiteBridgeTemplate(baseConfig);

    expect(output).toContain(
      'if namespace == "__chrome__" && method == "__chrome_sheet_post_message_to_sheet__" {',
    );
    expect(output).toContain("if !isMessageFromPrimaryWebView(message) {");
    expect(output).toContain(
      'chrome.sendEvent(name: "sheet.message", data: ["message": body["args"] ?? NSNull()])',
    );
    expect(output).toContain('chrome.postMessageToSheet(body["args"])');
  });
});
