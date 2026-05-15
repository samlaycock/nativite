import Foundation
import LocalAuthentication

private func localAuthAvailability(_ context: LAContext = LAContext()) -> [String: Any] {
  var error: NSError?
  let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    || context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
  guard !available, let error else {
    return ["available": available, "platform": "ios"]
  }

  return ["available": available, "platform": "ios", "reason": localAuthReason(error.code)]
}

private func localAuthReason(_ code: Int) -> String {
  switch code {
  case LAError.biometryNotEnrolled.rawValue:
    return "not-enrolled"
  case LAError.passcodeNotSet.rawValue:
    return "passcode-not-set"
  case LAError.biometryNotAvailable.rawValue:
    return "hardware-unavailable"
  default:
    return "unsupported"
  }
}

private func localAuthStatus(_ code: Int) -> String {
  switch code {
  case LAError.userCancel.rawValue, LAError.systemCancel.rawValue, LAError.appCancel.rawValue:
    return "cancelled"
  case LAError.userFallback.rawValue:
    return "fallback"
  case LAError.biometryLockout.rawValue:
    return "lockout"
  case LAError.biometryNotEnrolled.rawValue:
    return "not-enrolled"
  case LAError.biometryNotAvailable.rawValue, LAError.passcodeNotSet.rawValue:
    return "unavailable"
  default:
    return "failed"
  }
}

private func supportedLocalAuthTypes(_ context: LAContext = LAContext()) -> [String] {
  _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
  switch context.biometryType {
  case .faceID:
    return ["face"]
  case .touchID:
    return ["fingerprint"]
  case .none:
    return []
  @unknown default:
    return ["unknown"]
  }
}

func registerNativiteLocalAuthPlugin(_ bridge: NativiteBridge) {
  var activeContext: LAContext?

  bridge.register(namespace: "localAuth", method: "isAvailable") { _, completion in
    completion(.success(localAuthAvailability()))
  }

  bridge.register(namespace: "localAuth", method: "isEnrolled") { _, completion in
    let context = LAContext()
    var error: NSError?
    let enrolled = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
      || context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    completion(.success(["enrolled": enrolled, "platform": "ios"]))
  }

  bridge.register(namespace: "localAuth", method: "getSupportedTypes") { _, completion in
    completion(.success(["types": supportedLocalAuthTypes(), "platform": "ios"]))
  }

  bridge.register(namespace: "localAuth", method: "authenticate") { args, completion in
    guard
      let options = args as? [String: Any],
      let reason = options["reason"] as? String,
      !reason.isEmpty
    else {
      completion(.success(["status": "failed", "success": false, "platform": "ios", "error": "Missing authentication reason."]))
      return
    }

    let context = LAContext()
    context.localizedCancelTitle = options["cancelTitle"] as? String
    context.localizedFallbackTitle = options["fallbackTitle"] as? String
    activeContext = context

    let disableDeviceFallback = options["disableDeviceFallback"] as? Bool ?? false
    let policy: LAPolicy = disableDeviceFallback ? .deviceOwnerAuthenticationWithBiometrics : .deviceOwnerAuthentication
    context.evaluatePolicy(policy, localizedReason: reason) { success, error in
      activeContext = nil
      if success {
        completion(.success(["status": "success", "success": true, "platform": "ios"]))
        return
      }

      let nsError = error as NSError?
      completion(.success([
        "status": localAuthStatus(nsError?.code ?? LAError.authenticationFailed.rawValue),
        "success": false,
        "platform": "ios",
        "error": nsError?.localizedDescription ?? "Authentication failed.",
      ]))
    }
  }

  bridge.register(namespace: "localAuth", method: "cancel") { _, completion in
    activeContext?.invalidate()
    activeContext = nil
    completion(.success(["cancelled": true]))
  }
}
