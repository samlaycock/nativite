import Foundation

private let nativiteTestProtocolVersion = 1
private let nativiteTestCapabilities = [
  "runtime.ready",
  "chrome.snapshot.read",
  "chrome.areas.read",
  "logs.read",
  "viewTree.read",
  "screenshot.capture",
]

enum NativiteTestHarness {
  static var isEnabled: Bool {
    #if DEBUG
    return
      NativiteConfig.testHarnessEnabled &&
      !NativiteConfig.testURL.isEmpty &&
      !NativiteConfig.testCoordinatorURL.isEmpty &&
      !NativiteConfig.testSessionToken.isEmpty
    #else
    return false
    #endif
  }

  static var activeTestURL: URL? {
    guard isEnabled else { return nil }
    return URL(string: NativiteConfig.testURL)
  }

  static func register(platform: String) {
    #if DEBUG
    guard NativiteConfig.testHarnessEnabled else { return }
    guard isEnabled else {
      print("[NativiteTestHarness] Disabled: missing test URL, coordinator URL, or session token.")
      return
    }

    post(
      type: "harness.register",
      payload: [
        "appId": Bundle.main.bundleIdentifier ?? "",
        "runtimeVersion": NativiteConfig.appVersion,
        "protocolVersion": nativiteTestProtocolVersion,
        "platform": platform,
        "deviceId": ProcessInfo.processInfo.hostName,
        "deviceName": ProcessInfo.processInfo.hostName,
        "targetId": NativiteConfig.testTargetId,
        "testUrl": NativiteConfig.testURL,
        "capabilities": nativiteTestCapabilities,
        "timeouts": [
          "launchMs": NativiteConfig.testLaunchTimeoutMs,
          "webViewReadyMs": NativiteConfig.testWebViewReadyTimeoutMs,
          "coordinatorMs": NativiteConfig.testCoordinatorTimeoutMs,
        ],
      ]
    )
    post(
      type: "runtime.ready",
      payload: [
        "platform": platform,
        "debug": true,
        "appVersion": NativiteConfig.appVersion,
      ]
    )
    #endif
  }

  static func webViewReady(url: URL?) {
    #if DEBUG
    guard isEnabled else { return }
    post(type: "webview.ready", payload: ["url": url?.absoluteString ?? ""])
    #endif
  }

  private static func post(type: String, payload: [String: Any]) {
    guard let url = URL(string: NativiteConfig.testCoordinatorURL) else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = TimeInterval(NativiteConfig.testCoordinatorTimeoutMs) / 1000
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: [
      "protocol": "nativite.test",
      "version": nativiteTestProtocolVersion,
      "sessionId": NativiteConfig.testSessionId,
      "requestId": UUID().uuidString,
      "timestamp": ISO8601DateFormatter().string(from: Date()),
      "type": type,
      "token": NativiteConfig.testSessionToken,
      "payload": payload,
    ])

    URLSession.shared.dataTask(with: request).resume()
  }
}
