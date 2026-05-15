import Foundation
import LocalAuthentication
import Security

private let nativiteSecureStoreErrorDomain = "NativiteSecureStore"
private let maxSecureStoreValueBytes = 4096
private let defaultService = "dev.nativite.secure-store"

private func secureStoreError(_ code: String, _ message: String, operation: String) -> NSError {
  let payload = [
    "code": code,
    "message": message,
    "platform": platformName(),
    "operation": operation,
  ]
  let jsonMessage = (try? JSONSerialization.data(withJSONObject: payload))
    .flatMap { String(data: $0, encoding: .utf8) }
    ?? "{\"code\":\"operation-failed\",\"message\":\"Secure store operation failed\",\"platform\":\"\(platformName())\",\"operation\":\"\(operation)\"}"

  return NSError(
    domain: nativiteSecureStoreErrorDomain,
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: jsonMessage]
  )
}

private func platformName() -> String {
#if os(macOS)
  return "macos"
#else
  return "ios"
#endif
}

private func options(_ args: Any?) -> [String: Any] {
  return args as? [String: Any] ?? [:]
}

private func optionString(_ args: Any?, _ key: String) -> String? {
  let value = options(args)[key] as? String
  return value?.isEmpty == false ? value : nil
}

private func requiredString(_ args: Any?, _ key: String, operation: String) throws -> String {
  guard let value = optionString(args, key) else {
    throw secureStoreError("invalid-arguments", "Expected a non-empty \(key).", operation: operation)
  }
  return value
}

private func service(_ args: Any?) -> String {
  return optionString(args, "service") ?? defaultService
}

private func baseQuery(service: String, key: String) -> [String: Any] {
  return [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: key,
  ]
}

private func accessControl(_ args: Any?, operation: String) throws -> SecAccessControl? {
  let mode = optionString(args, "accessControl") ?? "none"
  guard mode != "none" else { return nil }

  let flags: SecAccessControlCreateFlags
  switch mode {
  case "user-presence":
    flags = .userPresence
  case "biometry-current-set":
    flags = .biometryCurrentSet
  default:
    throw secureStoreError("invalid-arguments", "Unsupported access control option: \(mode).", operation: operation)
  }

  var error: Unmanaged<CFError>?
  guard let control = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, flags, &error) else {
    throw secureStoreError("unavailable", error?.takeRetainedValue().localizedDescription ?? "Access control is unavailable.", operation: operation)
  }
  return control
}

private func keychainStatusError(_ status: OSStatus, operation: String) -> NSError {
  if status == errSecUserCanceled || status == errSecAuthFailed {
    return secureStoreError("authentication-failed", "Secure store authentication failed.", operation: operation)
  }
  if status == errSecItemNotFound {
    return secureStoreError("invalidated", "The secure store item is missing or was invalidated.", operation: operation)
  }
  let message = SecCopyErrorMessageString(status, nil) as String? ?? "Keychain operation failed with status \(status)."
  return secureStoreError("operation-failed", message, operation: operation)
}

func registerNativiteSecureStorePlugin(_ bridge: NativiteBridge) {
  bridge.register(namespace: "secureStore", method: "isAvailable") { _, completion in
    let context = LAContext()
    var error: NSError?
    let supportsBiometry = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    completion(.success([
      "available": true,
      "platform": platformName(),
      "supportsUserPresence": true,
      "supportsBiometryCurrentSet": supportsBiometry,
    ]))
  }

  bridge.register(namespace: "secureStore", method: "setItem") { args, completion in
    do {
      let operation = "setItem"
      let key = try requiredString(args, "key", operation: operation)
      let value = try requiredString(args, "value", operation: operation)
      guard let data = value.data(using: .utf8) else {
        throw secureStoreError("invalid-arguments", "Secure store values must be UTF-8 strings.", operation: operation)
      }
      guard data.count <= maxSecureStoreValueBytes else {
        throw secureStoreError("value-too-large", "Secure store values are limited to \(maxSecureStoreValueBytes) bytes.", operation: operation)
      }

      if let control = try accessControl(args, operation: operation) {
        let itemService = service(args)
        var query = baseQuery(service: itemService, key: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessControl as String] = control
        SecItemDelete(baseQuery(service: itemService, key: key) as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw keychainStatusError(status, operation: operation) }
        completion(.success(["stored": true]))
        return
      }

      let itemService = service(args)
      let query = baseQuery(service: itemService, key: key)
      let updateStatus = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
      if updateStatus == errSecItemNotFound {
        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw keychainStatusError(addStatus, operation: operation) }
      } else {
        guard updateStatus == errSecSuccess else { throw keychainStatusError(updateStatus, operation: operation) }
      }
      completion(.success(["stored": true]))
    } catch {
      completion(.failure(error))
    }
  }

  bridge.register(namespace: "secureStore", method: "getItem") { args, completion in
    do {
      let operation = "getItem"
      let key = try requiredString(args, "key", operation: operation)
      var query = baseQuery(service: service(args), key: key)
      query[kSecReturnData as String] = true
      query[kSecMatchLimit as String] = kSecMatchLimitOne
      if let prompt = optionString(args, "authenticationPrompt") {
        let context = LAContext()
        context.localizedReason = prompt
        query[kSecUseAuthenticationContext as String] = context
      }

      var result: CFTypeRef?
      let status = SecItemCopyMatching(query as CFDictionary, &result)
      if status == errSecItemNotFound {
        completion(.success(nil))
        return
      }
      guard status == errSecSuccess else { throw keychainStatusError(status, operation: operation) }
      guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
        throw secureStoreError("operation-failed", "Stored secure item could not be decoded.", operation: operation)
      }
      completion(.success(value))
    } catch {
      completion(.failure(error))
    }
  }

  bridge.register(namespace: "secureStore", method: "deleteItem") { args, completion in
    do {
      let operation = "deleteItem"
      let key = try requiredString(args, "key", operation: operation)
      let status = SecItemDelete(baseQuery(service: service(args), key: key) as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else {
        throw keychainStatusError(status, operation: operation)
      }
      completion(.success(["deleted": status == errSecSuccess]))
    } catch {
      completion(.failure(error))
    }
  }
}
