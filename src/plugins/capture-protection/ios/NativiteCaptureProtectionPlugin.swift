import Foundation
import UIKit

private let nativiteCaptureProtectionErrorDomain = "NativiteCaptureProtection"

private final class CaptureProtectionState {
  var keys = Set<String>()
  var observerTokens: [NSObjectProtocol] = []

  deinit {
    for token in observerTokens {
      NotificationCenter.default.removeObserver(token)
    }
  }
}

private func captureProtectionFailure(_ code: String, _ message: String, operation: String) -> NSError {
  let payload: [String: Any] = [
    "code": code,
    "message": message,
    "platform": "ios",
    "operation": operation,
  ]
  let jsonMessage = (try? JSONSerialization.data(withJSONObject: payload))
    .flatMap { String(data: $0, encoding: .utf8) }
    ?? "{\"code\":\"operation-failed\",\"message\":\"Capture protection operation failed\",\"platform\":\"ios\",\"operation\":\"\(operation)\"}"

  return NSError(
    domain: nativiteCaptureProtectionErrorDomain,
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: jsonMessage]
  )
}

private func captureProtectionKey(from args: Any?) -> String {
  guard
    let options = args as? [String: Any],
    let key = options["key"] as? String,
    !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  else {
    return "default"
  }
  return key
}

private func captureProtectionState(_ state: CaptureProtectionState) -> [String: Any] {
  [
    "platform": "ios",
    "preventionActive": false,
    "activeKeys": Array(state.keys).sorted(),
    "captured": UIScreen.main.isCaptured,
  ]
}

func registerNativiteCaptureProtectionPlugin(_ bridge: NativiteBridge) {
  let state = CaptureProtectionState()

  state.observerTokens.append(NotificationCenter.default.addObserver(
    forName: UIScreen.capturedDidChangeNotification,
    object: UIScreen.main,
    queue: .main
  ) { [weak bridge] _ in
    bridge?.sendEvent(name: "captureProtection:captureStatusChange", data: [
      "platform": "ios",
      "captured": UIScreen.main.isCaptured,
    ])
  })

  state.observerTokens.append(NotificationCenter.default.addObserver(
    forName: UIApplication.userDidTakeScreenshotNotification,
    object: nil,
    queue: .main
  ) { [weak bridge] _ in
    bridge?.sendEvent(name: "captureProtection:screenshot", data: ["platform": "ios"])
  })

  bridge.register(namespace: "captureProtection", method: "getCapabilities") { _, completion in
    completion(.success([
      "platform": "ios",
      "prevention": false,
      "screenshotDetection": true,
      "captureStatus": true,
    ]))
  }

  bridge.register(namespace: "captureProtection", method: "preventCapture") { _, completion in
    completion(.failure(captureProtectionFailure(
      "unsupported",
      "iOS does not expose a public API for reliable screenshot prevention. Use screenshot and capture-status events to react to capture activity.",
      operation: "preventCapture"
    )))
  }

  bridge.register(namespace: "captureProtection", method: "allowCapture") { args, completion in
    DispatchQueue.main.async {
      state.keys.remove(captureProtectionKey(from: args))
      completion(.success(captureProtectionState(state)))
    }
  }

  bridge.register(namespace: "captureProtection", method: "getState") { _, completion in
    DispatchQueue.main.async {
      completion(.success(captureProtectionState(state)))
    }
  }
}
