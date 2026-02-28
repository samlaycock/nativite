import type { NativiteConfig } from "../../index.ts";

export function nativiteBridgeTemplate(_config: NativiteConfig): string {
  return `import WebKit

// NativiteHandler receives (args, completion) and must call completion exactly once.
typealias NativiteHandler = (_ args: Any?, _ completion: @escaping (Result<Any?, Error>) -> Void) -> Void

// ─── NativiteBridge ──────────────────────────────────────────────────────────
// Conforms to WKScriptMessageHandlerWithReply (iOS 14+) so Swift can reply
// directly to JS Promises without an evaluateJavaScript roundtrip.
// Handler registration is namespaced: register(namespace:method:handler:)
// so plugins cannot accidentally collide with built-in methods.

class NativiteBridge: NSObject, WKScriptMessageHandlerWithReply {

  weak var viewController: ViewController?
  weak var primaryWebView: WKWebView?

  // Keyed as "namespace.method" for O(1) dispatch
  private var handlers: [String: NativiteHandler] = [:]

  // Chrome handler — lazily wired to viewController after init
  lazy var chrome: NativiteChrome = {
    let c = NativiteChrome()
    c.viewController = viewController
    return c
  }()

  override init() {
    super.init()
    registerBuiltinHandlers()
    registerNativitePlugins(on: self)
  }

  // ── Handler registration ────────────────────────────────────────────────────

  func register(namespace: String, method: String, handler: @escaping NativiteHandler) {
    handlers["\\(namespace).\\(method)"] = handler
  }

  // ── WKScriptMessageHandlerWithReply ─────────────────────────────────────────

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    guard
      let body = message.body as? [String: Any],
      let type = body["type"] as? String,
      type == "call",
      let namespace = body["namespace"] as? String,
      let method = body["method"] as? String
    else {
      replyHandler(nil, "Malformed bridge message")
      return
    }

    // Chrome setState — fire-and-forget, reply immediately
    if namespace == "__chrome__" && method == "__chrome_set_state__" {
      guard isMessageFromPrimaryWebView(message) else {
        replyHandler(nil, nil)
        return
      }
      chrome.viewController = viewController
      chrome.applyState(body["args"])
      replyHandler(nil, nil)
      return
    }

    // Chrome inter-webview messaging — native message broker
    if namespace == "__chrome__" && method == "__chrome_messaging_post_to_parent__" {
      if !isMessageFromPrimaryWebView(message) {
        // Child webview → primary webview
        chrome.viewController = viewController
        let fromName = chrome.instanceName(for: message.webView)
        chrome.sendEvent(name: "message", data: ["from": fromName, "payload": body["args"] ?? NSNull()])
      }
      replyHandler(nil, nil)
      return
    }

    if namespace == "__chrome__" && method == "__chrome_messaging_post_to_child__" {
      if isMessageFromPrimaryWebView(message) {
        chrome.viewController = viewController
        if let args = body["args"] as? [String: Any],
           let name = args["name"] as? String {
          chrome.postMessageToChild(name: name, payload: args["payload"])
        }
      }
      replyHandler(nil, nil)
      return
    }

    if namespace == "__chrome__" && method == "__chrome_messaging_broadcast__" {
      chrome.viewController = viewController
      let fromName = isMessageFromPrimaryWebView(message) ? "main" : chrome.instanceName(for: message.webView)
      chrome.broadcastMessage(from: fromName, payload: body["args"])
      replyHandler(nil, nil)
      return
    }

    // All other calls are dispatched to namespaced handlers
    dispatch(namespace: namespace, method: method, args: body["args"]) { result in
      switch result {
      case .success(let value):
        // Wrap in { result: ... } so JS can distinguish success from nil
        replyHandler(["result": value ?? NSNull()], nil)
      case .failure(let error):
        replyHandler(["error": error.localizedDescription], nil)
      }
    }
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────

  private func isMessageFromPrimaryWebView(_ message: WKScriptMessage) -> Bool {
    guard let primaryWebView else { return true }
    guard let sourceWebView = message.webView else { return true }
    return sourceWebView === primaryWebView
  }

  private func dispatch(
    namespace: String,
    method: String,
    args: Any?,
    completion: @escaping (Result<Any?, Error>) -> Void
  ) {
    let key = "\\(namespace).\\(method)"
    guard let handler = handlers[key] else {
      completion(.failure(BridgeError.unknownMethod(namespace: namespace, method: method)))
      return
    }
    handler(args, completion)
  }

  // ── Native-push events ──────────────────────────────────────────────────────
  // Events (native→JS push) still use evaluateJavaScript — there is no direct
  // reply channel in the native→JS direction.

  func sendEvent(name: String, data: Any) {
    viewController?.sendToWebView([
      "id": NSNull(),
      "type": "event",
      "event": name,
      "data": data,
    ])
  }

  // ── Built-in handlers ───────────────────────────────────────────────────────

  private func registerBuiltinHandlers() {
    register(namespace: "__nativite__", method: "__ping__") { _, completion in
      completion(.success("pong"))
    }

    register(namespace: "__nativite__", method: "__ota_check__") { _, completion in
      completion(.success(["available": false]))
    }
  }
}

// ─── BridgeError ──────────────────────────────────────────────────────────────

enum BridgeError: Error, LocalizedError {
  case unknownMethod(namespace: String, method: String)

  var errorDescription: String? {
    switch self {
    case .unknownMethod(let ns, let method):
      return "Unknown bridge method: \\(ns).\\(method)"
    }
  }
}
`;
}
