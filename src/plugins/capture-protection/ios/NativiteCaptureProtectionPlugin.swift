import Foundation
import UIKit

private final class CaptureProtectionState {
  var keys = Set<String>()
}

private func captureProtectionFailure(_ code: String, _ message: String, _ errorCode: Int = -1) -> NSError {
  NSError(
    domain: "NativiteCaptureProtection",
    code: errorCode,
    userInfo: [
      NSLocalizedDescriptionKey: message,
      "code": code,
      "platform": "ios",
    ]
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

  NotificationCenter.default.addObserver(
    forName: UIScreen.capturedDidChangeNotification,
    object: UIScreen.main,
    queue: .main
  ) { _ in
    bridge.sendEvent(name: "captureProtection:captureStatusChange", data: [
      "platform": "ios",
      "captured": UIScreen.main.isCaptured,
    ])
  }

  NotificationCenter.default.addObserver(
    forName: UIApplication.userDidTakeScreenshotNotification,
    object: nil,
    queue: .main
  ) { _ in
    bridge.sendEvent(name: "captureProtection:screenshot", data: ["platform": "ios"])
  }

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
      1
    )))
  }

  bridge.register(namespace: "captureProtection", method: "allowCapture") { args, completion in
    state.keys.remove(captureProtectionKey(from: args))
    completion(.success(captureProtectionState(state)))
  }

  bridge.register(namespace: "captureProtection", method: "getState") { _, completion in
    completion(.success(captureProtectionState(state)))
  }
}
