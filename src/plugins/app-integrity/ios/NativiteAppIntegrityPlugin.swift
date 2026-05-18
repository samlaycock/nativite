import CryptoKit
import DeviceCheck
import Foundation

private func appIntegrityError(_ code: String, _ message: String) -> [String: Any] {
  ["code": code, "message": message, "platform": "ios"]
}

private func appAttestUnavailable() -> [String: Any] {
  [
    "available": false,
    "platform": "ios",
    "provider": "app-attest",
    "error": appIntegrityError("unsupported-device", "App Attest is not available on this device."),
  ]
}

private func appIntegrityFailure(_ code: String, _ message: String, _ errorCode: Int = -1) -> NSError {
  NSError(
    domain: "NativiteAppIntegrity",
    code: errorCode,
    userInfo: [
      NSLocalizedDescriptionKey: message,
      "code": code,
      "platform": "ios",
    ]
  )
}

private func appIntegrityErrorCode(_ error: Error) -> String {
  let nsError = error as NSError
  if nsError.domain == DCError.errorDomain {
    switch nsError.code {
    case DCError.invalidKey.rawValue, DCError.invalidInput.rawValue:
      return "invalid-arguments"
    case DCError.serverUnavailable.rawValue:
      return "server-unavailable"
    case DCError.featureUnsupported.rawValue:
      return "unsupported-device"
    case DCError.unknownSystemFailure.rawValue:
      return "native-failure"
    default:
      return "native-failure"
    }
  }
  return "native-failure"
}

private func requireAppAttestSupport(_ completion: (Result<Any?, Error>) -> Void) -> Bool {
  guard DCAppAttestService.shared.isSupported else {
    completion(.failure(appIntegrityFailure(
      "unsupported-device",
      "App Attest is not available on this device."
    )))
    return false
  }
  return true
}

private func sha256Data(_ data: Data) -> Data {
  Data(SHA256.hash(data: data))
}

func registerNativiteAppIntegrityPlugin(_ bridge: NativiteBridge) {
  bridge.register(namespace: "appIntegrity", method: "isAppAttestAvailable") { _, completion in
    if DCAppAttestService.shared.isSupported {
      completion(.success(["available": true, "platform": "ios", "provider": "app-attest"]))
      return
    }
    completion(.success(appAttestUnavailable()))
  }

  bridge.register(namespace: "appIntegrity", method: "generateAppAttestKey") { _, completion in
    guard requireAppAttestSupport(completion) else { return }

    DCAppAttestService.shared.generateKey { keyId, error in
      if let keyId {
        completion(.success(["keyId": keyId, "platform": "ios"]))
        return
      }

      let error = error ?? NSError(domain: "NativiteAppIntegrity", code: -1)
      completion(.failure(appIntegrityFailure(
        appIntegrityErrorCode(error),
        error.localizedDescription,
        1
      )))
    }
  }

  bridge.register(namespace: "appIntegrity", method: "attestAppAttestKey") { args, completion in
    guard requireAppAttestSupport(completion) else { return }
    guard
      let options = args as? [String: Any],
      let keyId = options["keyId"] as? String,
      let challengeBase64 = options["challengeBase64"] as? String,
      let challenge = Data(base64Encoded: challengeBase64)
    else {
      completion(.failure(appIntegrityFailure(
        "invalid-arguments",
        "App Attest attestation requires keyId and challengeBase64.",
        2
      )))
      return
    }

    let clientDataHash = sha256Data(challenge)
    DCAppAttestService.shared.attestKey(keyId, clientDataHash: clientDataHash) { attestation, error in
      if let attestation {
        completion(.success([
          "keyId": keyId,
          "attestationObjectBase64": attestation.base64EncodedString(),
          "platform": "ios",
        ]))
        return
      }

      let error = error ?? NSError(domain: "NativiteAppIntegrity", code: -1)
      completion(.failure(appIntegrityFailure(
        appIntegrityErrorCode(error),
        error.localizedDescription,
        3
      )))
    }
  }

  bridge.register(namespace: "appIntegrity", method: "generateAppAttestAssertion") { args, completion in
    guard requireAppAttestSupport(completion) else { return }
    guard
      let options = args as? [String: Any],
      let keyId = options["keyId"] as? String,
      let clientDataHashBase64 = options["clientDataHashBase64"] as? String,
      let clientDataHash = Data(base64Encoded: clientDataHashBase64)
    else {
      completion(.failure(appIntegrityFailure(
        "invalid-arguments",
        "App Attest assertion requires keyId and clientDataHashBase64.",
        4
      )))
      return
    }

    DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: clientDataHash) { assertion, error in
      if let assertion {
        completion(.success([
          "keyId": keyId,
          "assertionObjectBase64": assertion.base64EncodedString(),
          "platform": "ios",
        ]))
        return
      }

      let error = error ?? NSError(domain: "NativiteAppIntegrity", code: -1)
      completion(.failure(appIntegrityFailure(
        appIntegrityErrorCode(error),
        error.localizedDescription,
        5
      )))
    }
  }
}
