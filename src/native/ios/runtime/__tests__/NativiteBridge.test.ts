import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "../NativiteBridge.swift")).text();

describe("NativiteBridge.swift", () => {
  it("OTA check handler always delegates to OTAUpdater (guarded at runtime by NativiteConfig)", () => {
    expect(swift).toContain(
      'register(namespace: "__nativite__", method: "__ota_check__") { _, completion in',
    );
    expect(swift).toContain("Task {");
    expect(swift).toContain("let status = await OTAUpdater().checkStatus()");
    expect(swift).toContain("completion(.success(status))");
  });

  it("scopes chrome mutations to the primary webview", () => {
    expect(swift).toContain("weak var primaryWebView: WKWebView?");
    expect(swift).toContain(
      "private func isMessageFromPrimaryWebView(_ message: WKScriptMessage) -> Bool",
    );
    expect(swift).toContain("guard isMessageFromPrimaryWebView(message) else {");
    expect(swift).toContain("guard let sourceWebView = message.webView else { return true }");
    expect(swift).toContain("return sourceWebView === primaryWebView");
  });

  it("handles post_to_parent messaging from child webviews", () => {
    expect(swift).toContain(
      'if namespace == "__chrome__" && method == "__chrome_messaging_post_to_parent__" {',
    );
    expect(swift).toContain("if !isMessageFromPrimaryWebView(message) {");
    expect(swift).toContain("let fromName = chrome.instanceName(for: message.webView)");
    expect(swift).toContain(
      'chrome.sendEvent(name: "message", data: ["from": fromName, "payload": body["args"] ?? NSNull()])',
    );
  });

  it("handles post_to_child messaging from the primary webview", () => {
    expect(swift).toContain(
      'if namespace == "__chrome__" && method == "__chrome_messaging_post_to_child__" {',
    );
    expect(swift).toContain('chrome.postMessageToChild(name: name, payload: args["payload"])');
  });

  it("handles broadcast messaging from any webview", () => {
    expect(swift).toContain(
      'if namespace == "__chrome__" && method == "__chrome_messaging_broadcast__" {',
    );
    expect(swift).toContain('chrome.broadcastMessage(from: fromName, payload: body["args"])');
  });
});
