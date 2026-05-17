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
  private static let postQueue = DispatchQueue(label: "dev.nativite.test-harness")

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

    postQueue.async {
      postSynchronously(
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
      postSynchronously(
        type: "runtime.ready",
        payload: [
          "platform": platform,
          "debug": true,
          "appVersion": NativiteConfig.appVersion,
        ]
      )
    }
    #endif
  }

  static func webViewReady(url: URL?) {
    #if DEBUG
    guard isEnabled else { return }
    postQueue.async {
      postSynchronously(type: "webview.ready", payload: ["url": url?.absoluteString ?? ""])
    }
    #endif
  }

  private static func postSynchronously(type: String, payload: [String: Any]) {
    guard let request = makeRequest(type: type, payload: payload) else { return }
    let semaphore = DispatchSemaphore(value: 0)
    var statusCode: Int?
    var requestError: Error?

    URLSession.shared.dataTask(with: request) { _, response, error in
      statusCode = (response as? HTTPURLResponse)?.statusCode
      requestError = error
      semaphore.signal()
    }.resume()

    let timeout = DispatchTime.now() + .milliseconds(NativiteConfig.testCoordinatorTimeoutMs + 1000)
    if semaphore.wait(timeout: timeout) == .timedOut {
      print("[NativiteTestHarness] Failed to send \(type): coordinator request timed out.")
      return
    }

    if let requestError {
      print("[NativiteTestHarness] Failed to send \(type): \(requestError.localizedDescription).")
      return
    }

    if let statusCode, !(200...299).contains(statusCode) {
      print("[NativiteTestHarness] Coordinator rejected \(type) with HTTP \(statusCode).")
    }
  }

  private static func makeRequest(type: String, payload: [String: Any]) -> URLRequest? {
    guard let url = URL(string: NativiteConfig.testCoordinatorURL) else { return nil }
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
    return request
  }
}
