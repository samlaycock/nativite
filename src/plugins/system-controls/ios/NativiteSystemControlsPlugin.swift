#if os(iOS)
import UIKit

private let nativiteSystemControlsErrorDomain = "NativiteSystemControls"
private let defaultKeepAwakeKey = "default"
private var keepAwakeKeys = Set<String>()
private var orientationLock: String?
private var originalBrightness: CGFloat?

private func systemControlsError(_ code: String, _ message: String, operation: String) -> NSError {
  let payload: [String: Any] = [
    "code": code,
    "message": message,
    "platform": "ios",
    "operation": operation,
  ]
  let jsonMessage = (try? JSONSerialization.data(withJSONObject: payload))
    .flatMap { String(data: $0, encoding: .utf8) }
    ?? "{\"code\":\"operation-failed\",\"message\":\"System controls operation failed\",\"platform\":\"ios\",\"operation\":\"\(operation)\"}"

  return NSError(
    domain: nativiteSystemControlsErrorDomain,
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: jsonMessage]
  )
}

private func options(_ args: Any?) -> [String: Any] {
  return args as? [String: Any] ?? [:]
}

private func keepAwakeKey(_ args: Any?) -> String {
  let value = options(args)["key"] as? String
  return value?.isEmpty == false ? value! : defaultKeepAwakeKey
}

private func currentOrientation() -> String {
  switch UIDevice.current.orientation {
  case .portrait, .portraitUpsideDown:
    return "portrait"
  case .landscapeLeft, .landscapeRight:
    return "landscape"
  default:
    let bounds = UIScreen.main.bounds
    return bounds.width > bounds.height ? "landscape" : "portrait"
  }
}

private func orientationMask(_ lock: String, operation: String) throws -> UIInterfaceOrientationMask {
  switch lock {
  case "portrait":
    return .portrait
  case "portrait-up":
    return .portrait
  case "portrait-down":
    return .portraitUpsideDown
  case "landscape":
    return .landscape
  case "landscape-left":
    return .landscapeLeft
  case "landscape-right":
    return .landscapeRight
  case "all":
    return .all
  default:
    throw systemControlsError("invalid-orientation-lock", "Unsupported orientation lock: \(lock).", operation: operation)
  }
}

private func orientationState() -> [String: Any] {
  return ["orientation": currentOrientation(), "lock": orientationLock ?? NSNull()]
}

private func brightnessState() -> [String: Any] {
  return ["brightness": Double(UIScreen.main.brightness), "canRestore": originalBrightness != nil]
}

private func setNeedsOrientationUpdate(_ viewController: UIViewController?) {
  if #available(iOS 16.0, *) {
    viewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
  }
  UIViewController.attemptRotationToDeviceOrientation()
}

func registerNativiteSystemControlsPlugin(_ bridge: NativiteBridge) {
  bridge.register(namespace: "systemControls", method: "getCapabilities") { _, completion in
    completion(.success([
      "platform": "ios",
      "keepAwake": true,
      "orientation": true,
      "appBrightness": true,
      "powerStatus": true,
    ]))
  }

  bridge.register(namespace: "systemControls", method: "activateKeepAwake") { args, completion in
    let key = keepAwakeKey(args)
    keepAwakeKeys.insert(key)
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = true
      completion(.success(["active": true, "key": key]))
    }
  }

  bridge.register(namespace: "systemControls", method: "deactivateKeepAwake") { args, completion in
    let key = keepAwakeKey(args)
    keepAwakeKeys.remove(key)
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = !keepAwakeKeys.isEmpty
      completion(.success(["active": !keepAwakeKeys.isEmpty, "key": key]))
    }
  }

  bridge.register(namespace: "systemControls", method: "getOrientation") { _, completion in
    completion(.success(orientationState()))
  }

  bridge.register(namespace: "systemControls", method: "lockOrientation") { args, completion in
    do {
      let operation = "lockOrientation"
      guard let lock = options(args)["lock"] as? String, !lock.isEmpty else {
        throw systemControlsError("invalid-arguments", "Expected a non-empty orientation lock.", operation: operation)
      }
      _ = try orientationMask(lock, operation: operation)
      orientationLock = lock
      UserDefaults.standard.set(lock, forKey: "NativiteSystemControlsOrientationLock")
      DispatchQueue.main.async {
        setNeedsOrientationUpdate(bridge.viewController)
        completion(.success(orientationState()))
      }
    } catch {
      completion(.failure(error))
    }
  }

  bridge.register(namespace: "systemControls", method: "unlockOrientation") { _, completion in
    orientationLock = nil
    UserDefaults.standard.removeObject(forKey: "NativiteSystemControlsOrientationLock")
    DispatchQueue.main.async {
      setNeedsOrientationUpdate(bridge.viewController)
      completion(.success(orientationState()))
    }
  }

  bridge.register(namespace: "systemControls", method: "getBrightness") { _, completion in
    completion(.success(brightnessState()))
  }

  bridge.register(namespace: "systemControls", method: "setBrightness") { args, completion in
    guard let brightness = options(args)["brightness"] as? Double,
          brightness >= 0,
          brightness <= 1
    else {
      completion(.failure(systemControlsError("invalid-arguments", "Brightness must be between 0 and 1.", operation: "setBrightness")))
      return
    }
    if originalBrightness == nil {
      originalBrightness = UIScreen.main.brightness
    }
    DispatchQueue.main.async {
      UIScreen.main.brightness = CGFloat(brightness)
      completion(.success(brightnessState()))
    }
  }

  bridge.register(namespace: "systemControls", method: "restoreBrightness") { _, completion in
    DispatchQueue.main.async {
      if let originalBrightness {
        UIScreen.main.brightness = originalBrightness
      }
      originalBrightness = nil
      completion(.success(brightnessState()))
    }
  }

  bridge.register(namespace: "systemControls", method: "getPowerStatus") { _, completion in
    UIDevice.current.isBatteryMonitoringEnabled = true
    let level = UIDevice.current.batteryLevel
    let batteryLevel = level >= 0 ? Double(level) : nil
    let batteryState: String
    switch UIDevice.current.batteryState {
    case .charging:
      batteryState = "charging"
    case .full:
      batteryState = "full"
    case .unplugged:
      batteryState = "unplugged"
    default:
      batteryState = "unknown"
    }
    let lowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
    completion(.success([
      "lowPowerMode": lowPowerMode,
      "batteryLevel": batteryLevel.map { $0 as Any } ?? NSNull(),
      "batteryState": batteryState,
    ]))
  }
}
#endif
