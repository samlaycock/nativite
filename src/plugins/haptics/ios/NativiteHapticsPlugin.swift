#if os(iOS)
import UIKit

private let nativiteHapticsErrorDomain = "NativiteHaptics"

private func hapticsError(_ code: String, _ message: String, operation: String) -> NSError {
  let payload: [String: Any] = [
    "code": code,
    "message": message,
    "platform": "ios",
    "operation": operation,
  ]
  let jsonMessage = (try? JSONSerialization.data(withJSONObject: payload))
    .flatMap { String(data: $0, encoding: .utf8) }
    ?? "{\"code\":\"operation-failed\",\"message\":\"Haptics operation failed\",\"platform\":\"ios\",\"operation\":\"\(operation)\"}"

  return NSError(
    domain: nativiteHapticsErrorDomain,
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: jsonMessage]
  )
}

private func options(_ args: Any?) -> [String: Any] {
  return args as? [String: Any] ?? [:]
}

private func impactStyle(_ style: String, operation: String) throws -> UIImpactFeedbackGenerator.FeedbackStyle {
  switch style {
  case "light":
    return .light
  case "medium":
    return .medium
  case "heavy":
    return .heavy
  case "rigid":
    if #available(iOS 13.0, *) {
      return .rigid
    }
    return .heavy
  case "soft":
    if #available(iOS 13.0, *) {
      return .soft
    }
    return .light
  default:
    throw hapticsError("invalid-impact-style", "Unsupported impact feedback style: \(style).", operation: operation)
  }
}

private func notificationStyle(_ style: String, operation: String) throws -> UINotificationFeedbackGenerator.FeedbackType {
  switch style {
  case "success":
    return .success
  case "warning":
    return .warning
  case "error":
    return .error
  default:
    throw hapticsError("invalid-notification-style", "Unsupported notification feedback style: \(style).", operation: operation)
  }
}

func registerNativiteHapticsPlugin(_ bridge: NativiteBridge) {
  bridge.register(namespace: "haptics", method: "getCapabilities") { _, completion in
    completion(.success([
      "platform": "ios",
      "available": true,
      "selection": true,
      "impact": ["light", "medium", "heavy", "rigid", "soft"],
      "notification": ["success", "warning", "error"],
    ]))
  }

  bridge.register(namespace: "haptics", method: "selection") { _, completion in
    DispatchQueue.main.async {
      let generator = UISelectionFeedbackGenerator()
      generator.prepare()
      generator.selectionChanged()
      completion(.success(["performed": true]))
    }
  }

  bridge.register(namespace: "haptics", method: "impact") { args, completion in
    do {
      let operation = "impact"
      let style = options(args)["style"] as? String ?? "medium"
      let feedbackStyle = try impactStyle(style, operation: operation)
      DispatchQueue.main.async {
        let generator = UIImpactFeedbackGenerator(style: feedbackStyle)
        generator.prepare()
        generator.impactOccurred()
        completion(.success(["performed": true, "style": style]))
      }
    } catch {
      completion(.failure(error))
    }
  }

  bridge.register(namespace: "haptics", method: "notification") { args, completion in
    do {
      let operation = "notification"
      guard let style = options(args)["style"] as? String, !style.isEmpty else {
        throw hapticsError("invalid-notification-style", "Expected a notification feedback style.", operation: operation)
      }
      let feedbackStyle = try notificationStyle(style, operation: operation)
      DispatchQueue.main.async {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(feedbackStyle)
        completion(.success(["performed": true, "style": style]))
      }
    } catch {
      completion(.failure(error))
    }
  }
}
#endif
