import Foundation
import UserNotifications

private let nativiteNotificationsErrorDomain = "NativiteNotifications"
private var nativiteInitialNotificationResponse: [String: Any]?
private var nativiteForegroundPolicy: [String: Any] = [
  "showAlert": true,
  "playSound": true,
  "setBadge": true,
]

private func notificationsError(_ code: String, _ message: String, operation: String) -> NSError {
  let payload = [
    "code": code,
    "message": message,
    "platform": "ios",
    "operation": operation,
  ]
  let jsonMessage = (try? JSONSerialization.data(withJSONObject: payload))
    .flatMap { String(data: $0, encoding: .utf8) }
    ?? "{\"code\":\"operation-failed\",\"message\":\"Notifications operation failed\",\"platform\":\"ios\",\"operation\":\"\(operation)\"}"

  return NSError(
    domain: nativiteNotificationsErrorDomain,
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: jsonMessage]
  )
}

private func permissionResponse(_ settings: UNNotificationSettings) -> [String: Any] {
  switch settings.authorizationStatus {
  case .authorized, .provisional, .ephemeral:
    return ["status": "granted", "canAskAgain": false, "platform": "ios"]
  case .denied:
    return ["status": "denied", "canAskAgain": false, "platform": "ios"]
  case .notDetermined:
    return ["status": "prompt", "canAskAgain": true, "platform": "ios"]
  @unknown default:
    return ["status": "unknown", "canAskAgain": false, "platform": "ios"]
  }
}

private func currentPermissionResponse(_ center: UNUserNotificationCenter, completion: @escaping ([String: Any]) -> Void) {
  center.getNotificationSettings { settings in
    completion(permissionResponse(settings))
  }
}

private func notificationContent(_ input: [String: Any]) throws -> UNMutableNotificationContent {
  guard let title = input["title"] as? String, !title.isEmpty else {
    throw notificationsError("invalid-arguments", "Notification title is required.", operation: "scheduleNotification")
  }

  let content = UNMutableNotificationContent()
  content.title = title
  content.body = input["body"] as? String ?? ""
  content.subtitle = input["subtitle"] as? String ?? ""
  if let badge = input["badge"] as? Int {
    content.badge = NSNumber(value: badge)
  }
  if let sound = input["sound"] as? String, !sound.isEmpty {
    content.sound = UNNotificationSound(named: UNNotificationSoundName(sound))
  } else {
    content.sound = .default
  }
  if let categoryId = input["categoryId"] as? String {
    content.categoryIdentifier = categoryId
  }
  if let data = input["data"] as? [String: Any] {
    content.userInfo = data
  }
  return content
}

private func notificationTrigger(_ input: [String: Any]) throws -> UNNotificationTrigger {
  guard let type = input["type"] as? String else {
    throw notificationsError("invalid-arguments", "Notification trigger type is required.", operation: "scheduleNotification")
  }

  if type == "timeInterval" {
    let seconds = input["seconds"] as? TimeInterval ?? 0
    guard seconds > 0 else {
      throw notificationsError("invalid-arguments", "Time interval triggers require seconds greater than zero.", operation: "scheduleNotification")
    }
    return UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: input["repeats"] as? Bool ?? false)
  }

  if type == "date", let value = input["date"] as? String {
    let formatter = ISO8601DateFormatter()
    guard let date = formatter.date(from: value) else {
      throw notificationsError("invalid-arguments", "Date triggers require an ISO 8601 date string.", operation: "scheduleNotification")
    }
    let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
    return UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
  }

  throw notificationsError("invalid-arguments", "Unsupported notification trigger.", operation: "scheduleNotification")
}

private func responseDictionary(_ response: UNNotificationResponse) -> [String: Any] {
  [
    "notificationId": response.notification.request.identifier,
    "actionId": response.actionIdentifier,
    "data": response.notification.request.content.userInfo,
  ]
}

private func categories(_ args: Any?) -> Set<UNNotificationCategory> {
  guard
    let options = args as? [String: Any],
    let rawCategories = options["categories"] as? [[String: Any]]
  else {
    return []
  }

  return Set(rawCategories.compactMap { raw in
    guard let id = raw["id"] as? String else { return nil }
    let actions = (raw["actions"] as? [[String: Any]] ?? []).compactMap { rawAction -> UNNotificationAction? in
      guard let actionId = rawAction["id"] as? String, let title = rawAction["title"] as? String else { return nil }
      var options: UNNotificationActionOptions = []
      if rawAction["foreground"] as? Bool == true { options.insert(.foreground) }
      if rawAction["destructive"] as? Bool == true { options.insert(.destructive) }
      if rawAction["authenticationRequired"] as? Bool == true { options.insert(.authenticationRequired) }
      return UNNotificationAction(identifier: actionId, title: title, options: options)
    }
    return UNNotificationCategory(identifier: id, actions: actions, intentIdentifiers: [], options: [])
  })
}

func registerNativiteNotificationsPlugin(_ bridge: NativiteBridge) {
  let center = UNUserNotificationCenter.current()

  bridge.register(namespace: "notifications", method: "getPermissionStatus") { _, completion in
    currentPermissionResponse(center) { response in
      completion(.success(response))
    }
  }

  bridge.register(namespace: "notifications", method: "requestPermissions") { _, completion in
    center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
      currentPermissionResponse(center) { response in
        completion(.success(response))
      }
    }
  }

  bridge.register(namespace: "notifications", method: "createChannel") { args, completion in
    guard let channel = args as? [String: Any], let id = channel["id"] as? String else {
      completion(.failure(notificationsError("invalid-arguments", "Notification channel id is required.", operation: "createChannel")))
      return
    }
    completion(.success(["id": id]))
  }

  bridge.register(namespace: "notifications", method: "setCategories") { args, completion in
    let notificationCategories = categories(args)
    center.setNotificationCategories(notificationCategories)
    completion(.success(["registered": notificationCategories.count]))
  }

  bridge.register(namespace: "notifications", method: "scheduleNotification") { args, completion in
    guard
      let options = args as? [String: Any],
      let rawContent = options["content"] as? [String: Any],
      let rawTrigger = options["trigger"] as? [String: Any]
    else {
      completion(.failure(notificationsError("invalid-arguments", "Notification content and trigger are required.", operation: "scheduleNotification")))
      return
    }

    do {
      let id = options["id"] as? String ?? UUID().uuidString
      let request = UNNotificationRequest(
        identifier: id,
        content: try notificationContent(rawContent),
        trigger: try notificationTrigger(rawTrigger)
      )
      center.add(request) { error in
        if let error {
          completion(.failure(notificationsError("operation-failed", error.localizedDescription, operation: "scheduleNotification")))
          return
        }
        completion(.success(["id": id]))
      }
    } catch {
      completion(.failure(error))
    }
  }

  bridge.register(namespace: "notifications", method: "cancelNotification") { args, completion in
    guard let options = args as? [String: Any], let id = options["id"] as? String else {
      completion(.failure(notificationsError("invalid-arguments", "Notification id is required.", operation: "cancelNotification")))
      return
    }
    center.removePendingNotificationRequests(withIdentifiers: [id])
    completion(.success(["cancelled": true]))
  }

  bridge.register(namespace: "notifications", method: "cancelAllNotifications") { _, completion in
    center.removeAllPendingNotificationRequests()
    completion(.success(["cancelled": true]))
  }

  bridge.register(namespace: "notifications", method: "listScheduledNotifications") { _, completion in
    center.getPendingNotificationRequests { requests in
      completion(.success([
        "notifications": requests.map { request in
          [
            "id": request.identifier,
            "content": [
              "title": request.content.title,
              "body": request.content.body,
              "subtitle": request.content.subtitle,
              "data": request.content.userInfo,
            ],
          ]
        },
      ]))
    }
  }

  bridge.register(namespace: "notifications", method: "getInitialNotificationResponse") { _, completion in
    completion(.success(nativiteInitialNotificationResponse))
  }

  bridge.register(namespace: "notifications", method: "setForegroundNotificationPolicy") { args, completion in
    nativiteForegroundPolicy = args as? [String: Any] ?? nativiteForegroundPolicy
    completion(.success(nativiteForegroundPolicy))
  }

  bridge.register(namespace: "notifications", method: "registerForPushNotifications") { _, completion in
    completion(.failure(notificationsError("unsupported", "Push token registration requires app-specific APNs setup and is not implemented by the first local-notifications release.", operation: "registerForPushNotifications")))
  }
}
