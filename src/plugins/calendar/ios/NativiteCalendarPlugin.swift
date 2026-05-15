import EventKit
import EventKitUI
import Foundation
import ObjectiveC
import UIKit

private let nativiteCalendarErrorDomain = "NativiteCalendar"
private var calendarEventEditDelegateKey: UInt8 = 0
private var calendarEventViewDismissTargetKey: UInt8 = 0

private func calendarError(_ code: String, _ message: String, operation: String) -> NSError {
  let payload = [
    "code": code,
    "message": message,
    "platform": "ios",
    "operation": operation,
  ]
  let jsonMessage = (try? JSONSerialization.data(withJSONObject: payload))
    .flatMap { String(data: $0, encoding: .utf8) }
    ?? "{\"code\":\"operation-failed\",\"message\":\"Calendar operation failed\",\"platform\":\"ios\",\"operation\":\"\(operation)\"}"

  return NSError(
    domain: nativiteCalendarErrorDomain,
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: jsonMessage]
  )
}

private func requestedKind(_ args: Any?) -> String {
  guard let options = args as? [String: Any], let kind = options["kind"] as? String else {
    return "events"
  }
  return kind
}

private func entityType(from args: Any?) -> EKEntityType {
  guard let options = args as? [String: Any], let raw = options["entityType"] as? String else {
    return .event
  }
  return raw == "reminder" ? .reminder : .event
}

private func entityType(forKind kind: String) -> EKEntityType {
  return kind == "reminders" ? .reminder : .event
}

private func permissionResponse(_ status: EKAuthorizationStatus, kind: String) -> [String: Any] {
  switch status {
  case .fullAccess, .writeOnly:
    return ["status": "granted", "canAskAgain": false, "kind": kind, "platform": "ios"]
  case .authorized:
    return ["status": "granted", "canAskAgain": false, "kind": kind, "platform": "ios"]
  case .denied:
    return ["status": "denied", "canAskAgain": false, "kind": kind, "platform": "ios"]
  case .restricted:
    return ["status": "restricted", "canAskAgain": false, "kind": kind, "platform": "ios"]
  case .notDetermined:
    return ["status": "prompt", "canAskAgain": true, "kind": kind, "platform": "ios"]
  @unknown default:
    return ["status": "unknown", "canAskAgain": false, "kind": kind, "platform": "ios"]
  }
}

private func hasAccess(_ entityType: EKEntityType) -> Bool {
  let status = EKEventStore.authorizationStatus(for: entityType)
  if #available(iOS 17.0, *) {
    return status == .fullAccess || status == .writeOnly || status == .authorized
  }
  return status == .authorized
}

private func isoDate(_ value: Any?) throws -> Date {
  guard let raw = value as? String else {
    throw calendarError("invalid-arguments", "Expected an ISO date string.", operation: "parseDate")
  }
  guard let date = ISO8601DateFormatter().date(from: raw) else {
    throw calendarError("invalid-arguments", "Invalid ISO date string: \(raw)", operation: "parseDate")
  }
  return date
}

private func isoString(_ date: Date?) -> String? {
  guard let date else { return nil }
  return ISO8601DateFormatter().string(from: date)
}

private func sourceType(_ source: EKSource) -> String {
  switch source.sourceType {
  case .local: return "local"
  case .calDAV: return "caldav"
  case .exchange: return "exchange"
  case .subscribed: return "subscription"
  case .birthdays: return "birthdays"
  @unknown default: return "unknown"
  }
}

private func calendarDictionary(_ calendar: EKCalendar) -> [String: Any] {
  return [
    "id": calendar.calendarIdentifier,
    "title": calendar.title,
    "sourceId": calendar.source.sourceIdentifier,
    "source": [
      "id": calendar.source.sourceIdentifier,
      "title": calendar.source.title,
      "type": sourceType(calendar.source),
    ],
    "allowsContentModifications": calendar.allowsContentModifications,
    "entityTypes": [calendar.type == .birthday ? "event" : calendar.allowedEntityTypes.contains(.reminder) ? "reminder" : "event"],
    "platform": "ios",
  ]
}

private func eventDictionary(_ event: EKEvent) -> [String: Any] {
  var out: [String: Any] = [
    "id": event.eventIdentifier ?? "",
    "calendarId": event.calendar.calendarIdentifier,
    "title": event.title ?? "",
    "startDate": isoString(event.startDate) ?? "",
    "endDate": isoString(event.endDate) ?? "",
    "allDay": event.isAllDay,
  ]
  if let location = event.location { out["location"] = location }
  if let notes = event.notes { out["notes"] = notes }
  if let url = event.url { out["url"] = url.absoluteString }
  if let timeZone = event.timeZone { out["timeZone"] = timeZone.identifier }
  return out
}

private func applyEventInput(_ args: [String: Any], to event: EKEvent, store: EKEventStore) throws {
  guard let calendarId = args["calendarId"] as? String,
        let calendar = store.calendar(withIdentifier: calendarId),
        let title = args["title"] as? String
  else {
    throw calendarError("invalid-arguments", "Events require calendarId and title.", operation: "saveEvent")
  }
  event.calendar = calendar
  event.title = title
  event.startDate = try isoDate(args["startDate"])
  event.endDate = try isoDate(args["endDate"])
  event.isAllDay = args["allDay"] as? Bool ?? false
  event.location = args["location"] as? String
  event.notes = args["notes"] as? String
  if let rawUrl = args["url"] as? String {
    event.url = URL(string: rawUrl)
  }
  if let rawTimeZone = args["timeZone"] as? String {
    event.timeZone = TimeZone(identifier: rawTimeZone)
  }
}

private func reminderDictionary(_ reminder: EKReminder) -> [String: Any] {
  var out: [String: Any] = [
    "id": reminder.calendarItemIdentifier,
    "calendarId": reminder.calendar.calendarIdentifier,
    "title": reminder.title ?? "",
    "completed": reminder.isCompleted,
  ]
  if let notes = reminder.notes { out["notes"] = notes }
  if let dueDate = reminder.dueDateComponents?.date { out["dueDate"] = isoString(dueDate) }
  return out
}

private func applyReminderInput(_ args: [String: Any], to reminder: EKReminder, store: EKEventStore) throws {
  guard let calendarId = args["calendarId"] as? String,
        let calendar = store.calendar(withIdentifier: calendarId),
        let title = args["title"] as? String
  else {
    throw calendarError("invalid-arguments", "Reminders require calendarId and title.", operation: "saveReminder")
  }
  reminder.calendar = calendar
  reminder.title = title
  reminder.notes = args["notes"] as? String
  reminder.isCompleted = args["completed"] as? Bool ?? false
  if let dueDate = args["dueDate"] {
    reminder.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: try isoDate(dueDate))
  }
}

private func topViewController() -> UIViewController? {
  let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
  var controller = scene?.windows.first { $0.isKeyWindow }?.rootViewController
  while let presented = controller?.presentedViewController {
    controller = presented
  }
  return controller
}

private final class CalendarEventEditDelegate: NSObject, EKEventEditViewDelegate {
  func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
    controller.dismiss(animated: true) {
      objc_setAssociatedObject(controller, &calendarEventEditDelegateKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }
  }
}

private final class CalendarEventViewDismissTarget: NSObject {
  weak var controller: UIViewController?

  init(controller: UIViewController) {
    self.controller = controller
  }

  @objc func dismiss() {
    guard let controller else { return }
    controller.dismiss(animated: true) {
      objc_setAssociatedObject(controller, &calendarEventViewDismissTargetKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }
  }
}

func registerNativiteCalendarPlugin(_ bridge: NativiteBridge) {
  let store = EKEventStore()

  bridge.register(namespace: "calendar", method: "getPermissionStatus") { args, completion in
    let kind = requestedKind(args)
    let entityType = entityType(forKind: kind)
    completion(.success(permissionResponse(EKEventStore.authorizationStatus(for: entityType), kind: kind)))
  }

  bridge.register(namespace: "calendar", method: "requestPermissions") { args, completion in
    let kind = requestedKind(args)
    let entityType = entityType(forKind: kind)
    if #available(iOS 17.0, *) {
      if entityType == .reminder {
        store.requestFullAccessToReminders { _, _ in
          completion(.success(permissionResponse(EKEventStore.authorizationStatus(for: entityType), kind: kind)))
        }
      } else {
        store.requestFullAccessToEvents { _, _ in
          completion(.success(permissionResponse(EKEventStore.authorizationStatus(for: entityType), kind: kind)))
        }
      }
    } else {
      store.requestAccess(to: entityType) { _, _ in
        completion(.success(permissionResponse(EKEventStore.authorizationStatus(for: entityType), kind: kind)))
      }
    }
  }

  bridge.register(namespace: "calendar", method: "listCalendars") { args, completion in
    let type = entityType(from: args)
    guard hasAccess(type) else {
      completion(.failure(calendarError("permission-denied", "Calendar permission has not been granted.", operation: "listCalendars")))
      return
    }
    completion(.success(["calendars": store.calendars(for: type).map(calendarDictionary)]))
  }

  bridge.register(namespace: "calendar", method: "queryEvents") { args, completion in
    guard hasAccess(.event) else {
      completion(.failure(calendarError("permission-denied", "Calendar event permission has not been granted.", operation: "queryEvents")))
      return
    }
    guard let options = args as? [String: Any] else {
      completion(.failure(calendarError("invalid-arguments", "queryEvents requires options.", operation: "queryEvents")))
      return
    }
    do {
      let startDate = try isoDate(options["startDate"])
      let endDate = try isoDate(options["endDate"])
      let ids = options["calendarIds"] as? [String] ?? []
      let calendars = ids.isEmpty ? nil : ids.compactMap { store.calendar(withIdentifier: $0) }
      let predicate = store.predicateForEvents(withStart: startDate, end: endDate, calendars: calendars)
      let pageSize = min(max(options["pageSize"] as? Int ?? 500, 1), 2_000)
      let events = Array(store.events(matching: predicate).prefix(pageSize)).map(eventDictionary)
      completion(.success(["events": events]))
    } catch {
      completion(.failure(calendarError("operation-failed", error.localizedDescription, operation: "queryEvents")))
    }
  }

  bridge.register(namespace: "calendar", method: "createEvent") { args, completion in
    guard hasAccess(.event) else {
      completion(.failure(calendarError("permission-denied", "Calendar event permission has not been granted.", operation: "createEvent")))
      return
    }
    guard let input = args as? [String: Any] else {
      completion(.failure(calendarError("invalid-arguments", "createEvent requires an event.", operation: "createEvent")))
      return
    }
    do {
      let event = EKEvent(eventStore: store)
      try applyEventInput(input, to: event, store: store)
      try store.save(event, span: .futureEvents, commit: true)
      completion(.success(["id": event.eventIdentifier ?? ""]))
    } catch {
      completion(.failure(calendarError("operation-failed", error.localizedDescription, operation: "createEvent")))
    }
  }

  bridge.register(namespace: "calendar", method: "updateEvent") { args, completion in
    guard hasAccess(.event) else {
      completion(.failure(calendarError("permission-denied", "Calendar event permission has not been granted.", operation: "updateEvent")))
      return
    }
    guard let input = args as? [String: Any], let id = input["id"] as? String else {
      completion(.failure(calendarError("invalid-arguments", "updateEvent requires an id.", operation: "updateEvent")))
      return
    }
    guard let event = store.event(withIdentifier: id) else {
      completion(.failure(calendarError("not-found", "Calendar event was not found.", operation: "updateEvent")))
      return
    }
    do {
      try applyEventInput(input, to: event, store: store)
      try store.save(event, span: .futureEvents, commit: true)
      completion(.success(["id": event.eventIdentifier ?? id]))
    } catch {
      completion(.failure(calendarError("operation-failed", error.localizedDescription, operation: "updateEvent")))
    }
  }

  bridge.register(namespace: "calendar", method: "deleteEvent") { args, completion in
    guard hasAccess(.event) else {
      completion(.failure(calendarError("permission-denied", "Calendar event permission has not been granted.", operation: "deleteEvent")))
      return
    }
    guard let options = args as? [String: Any], let id = options["id"] as? String else {
      completion(.failure(calendarError("invalid-arguments", "deleteEvent requires an id.", operation: "deleteEvent")))
      return
    }
    guard let event = store.event(withIdentifier: id) else {
      completion(.success(["deleted": false]))
      return
    }
    do {
      try store.remove(event, span: .futureEvents, commit: true)
      completion(.success(["deleted": true]))
    } catch {
      completion(.failure(calendarError("operation-failed", error.localizedDescription, operation: "deleteEvent")))
    }
  }

  bridge.register(namespace: "calendar", method: "openEvent") { args, completion in
    guard let options = args as? [String: Any], let id = options["id"] as? String else {
      completion(.failure(calendarError("invalid-arguments", "openEvent requires an id.", operation: "openEvent")))
      return
    }
    guard let event = store.event(withIdentifier: id) else {
      completion(.failure(calendarError("not-found", "Calendar event was not found.", operation: "openEvent")))
      return
    }
    let mode = options["mode"] as? String ?? "view"
    DispatchQueue.main.async {
      guard let presenter = topViewController() else {
        completion(.failure(calendarError("native-unavailable", "No active view controller is available.", operation: "openEvent")))
        return
      }
      let controller: UIViewController
      if mode == "edit" {
        let editController = EKEventEditViewController()
        let delegate = CalendarEventEditDelegate()
        objc_setAssociatedObject(editController, &calendarEventEditDelegateKey, delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        editController.editViewDelegate = delegate
        editController.eventStore = store
        editController.event = event
        controller = editController
      } else {
        let viewController = EKEventViewController()
        viewController.event = event
        viewController.allowsEditing = false
        let navigationController = UINavigationController(rootViewController: viewController)
        let dismissTarget = CalendarEventViewDismissTarget(controller: navigationController)
        objc_setAssociatedObject(navigationController, &calendarEventViewDismissTargetKey, dismissTarget, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        viewController.navigationItem.leftBarButtonItem = UIBarButtonItem(
          barButtonSystemItem: .done,
          target: dismissTarget,
          action: #selector(CalendarEventViewDismissTarget.dismiss)
        )
        controller = navigationController
      }
      presenter.present(controller, animated: true) {
        completion(.success(["opened": true]))
      }
    }
  }

  bridge.register(namespace: "calendar", method: "createReminder") { args, completion in
    guard hasAccess(.reminder) else {
      completion(.failure(calendarError("permission-denied", "Reminder permission has not been granted.", operation: "createReminder")))
      return
    }
    guard let input = args as? [String: Any] else {
      completion(.failure(calendarError("invalid-arguments", "createReminder requires a reminder.", operation: "createReminder")))
      return
    }
    do {
      let reminder = EKReminder(eventStore: store)
      try applyReminderInput(input, to: reminder, store: store)
      try store.save(reminder, commit: true)
      completion(.success(["id": reminder.calendarItemIdentifier]))
    } catch {
      completion(.failure(calendarError("operation-failed", error.localizedDescription, operation: "createReminder")))
    }
  }

  bridge.register(namespace: "calendar", method: "updateReminder") { args, completion in
    guard hasAccess(.reminder) else {
      completion(.failure(calendarError("permission-denied", "Reminder permission has not been granted.", operation: "updateReminder")))
      return
    }
    guard let input = args as? [String: Any], let id = input["id"] as? String else {
      completion(.failure(calendarError("invalid-arguments", "updateReminder requires an id.", operation: "updateReminder")))
      return
    }
    guard let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
      completion(.failure(calendarError("not-found", "Reminder was not found.", operation: "updateReminder")))
      return
    }
    do {
      try applyReminderInput(input, to: reminder, store: store)
      try store.save(reminder, commit: true)
      completion(.success(["id": reminder.calendarItemIdentifier]))
    } catch {
      completion(.failure(calendarError("operation-failed", error.localizedDescription, operation: "updateReminder")))
    }
  }

  bridge.register(namespace: "calendar", method: "deleteReminder") { args, completion in
    guard hasAccess(.reminder) else {
      completion(.failure(calendarError("permission-denied", "Reminder permission has not been granted.", operation: "deleteReminder")))
      return
    }
    guard let options = args as? [String: Any], let id = options["id"] as? String else {
      completion(.failure(calendarError("invalid-arguments", "deleteReminder requires an id.", operation: "deleteReminder")))
      return
    }
    guard let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
      completion(.success(["deleted": false]))
      return
    }
    do {
      try store.remove(reminder, commit: true)
      completion(.success(["deleted": true]))
    } catch {
      completion(.failure(calendarError("operation-failed", error.localizedDescription, operation: "deleteReminder")))
    }
  }
}
