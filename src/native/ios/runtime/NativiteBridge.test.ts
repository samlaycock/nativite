import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "NativiteBridge.swift")).text();

describe("NativiteBridge.swift", () => {
  it("OTA check handler always delegates to OTAUpdater (guarded at runtime by NativiteConfig)", () => {
    expect(swift).toContain(
      'register(namespace: "__nativite__", method: "__ota_check__") { _, completion in',
    );
    expect(swift).toContain("Task {");
    expect(swift).toContain("let status = await OTAUpdater().checkStatus()");
    expect(swift).toContain("completion(.success(status))");
  });

  it("keeps the iOS background scheduler available for built-in background handlers", () => {
    expect(swift).toContain(
      "private let backgroundTaskScheduler = NativiteBackgroundTaskScheduler()",
    );
    expect(swift).toContain(
      'register(namespace: "__background__", method: "schedule") { [weak self] args, completion in',
    );
    expect(swift).toContain("self.backgroundTaskScheduler.status(id: taskId) { result in");
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

  it("validates NCLP snapshots before applying chrome state", () => {
    expect(swift).toContain("private var lastChromeRevisionByDocId: [String: Int] = [:]");
    expect(swift).toContain("guard acceptChromeSnapshot(body) else");
    expect(swift).toContain('snapshot["nativite"] as? Int == 2');
    expect(swift).toContain('snapshot["type"] as? String == "chrome.snapshot"');
    expect(swift).toContain("revision <= lastRevision");
    expect(swift).toContain('state["selected"] is [String: Any]');
    expect(swift).toContain("nodes.count <= Self.maxChromeSnapshotNodes");
    expect(swift).toContain("children.count > Self.maxChromeSnapshotChildren");
    expect(swift).toContain("Self.nclpLeafKinds.contains(kind)");
    expect(swift).toContain("isReachableAcyclicGraph(rootId: rootId, nodes: nodes)");
    expect(swift).toContain("visited.count == nodes.count");
    expect(swift).toContain('case "action":');
    expect(swift).toContain('return childKind == "menu"');
  });

  it("preserves NCLP node identity through the legacy chrome adapter", () => {
    expect(swift).toContain('item["nclpId"] = id');
    expect(swift).toContain('item["nclpId"] = childId');
    expect(swift).toContain('legacy["nclpId"] = menuId');
    expect(swift).toContain('"menus": menuIds.compactMap');
  });
});
