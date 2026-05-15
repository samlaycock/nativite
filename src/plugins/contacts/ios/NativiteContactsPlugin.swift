import Contacts
import Foundation

private let nativiteContactsErrorDomain = "NativiteContacts"

private func contactsError(_ code: String, _ message: String, operation: String) -> NSError {
  let payload = [
    "code": code,
    "message": message,
    "platform": "ios",
    "operation": operation,
  ]
  let jsonMessage = (try? JSONSerialization.data(withJSONObject: payload))
    .flatMap { String(data: $0, encoding: .utf8) }
    ?? "{\"code\":\"operation-failed\",\"message\":\"Contacts operation failed\",\"platform\":\"ios\",\"operation\":\"\(operation)\"}"

  return NSError(
    domain: nativiteContactsErrorDomain,
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: jsonMessage]
  )
}

private func permissionResponse(_ status: CNAuthorizationStatus) -> [String: Any] {
  switch status {
  case .authorized:
    return ["status": "granted", "canAskAgain": false, "platform": "ios"]
  case .denied:
    return ["status": "denied", "canAskAgain": false, "platform": "ios"]
  case .restricted:
    return ["status": "restricted", "canAskAgain": false, "platform": "ios"]
  case .notDetermined:
    return ["status": "prompt", "canAskAgain": true, "platform": "ios"]
  @unknown default:
    return ["status": "unknown", "canAskAgain": false, "platform": "ios"]
  }
}

private let defaultContactFields: Set<String> = [
  "id",
  "name",
  "phones",
  "emails",
  "addresses",
  "organization",
  "birthday",
]

private let supportedContactFields: Set<String> = defaultContactFields.union([
  // Fetching CNContactNoteKey on iOS 13+ requires the
  // com.apple.developer.contacts.notes entitlement. It is supported only when
  // callers explicitly request it and provision the entitlement themselves.
  "note",
])

private func requestedFields(_ args: Any?) -> Set<String> {
  guard
    let options = args as? [String: Any],
    let fields = options["fields"] as? [String],
    !fields.isEmpty
  else {
    return defaultContactFields
  }

  let knownFields = Set(fields).intersection(supportedContactFields)
  return knownFields.isEmpty ? defaultContactFields : knownFields.union(["id", "name"])
}

private func requestedPageSize(_ args: Any?) -> Int {
  guard let options = args as? [String: Any] else { return 100 }
  let rawPageSize = options["pageSize"] as? Int ?? 100
  return min(max(rawPageSize, 1), 500)
}

private func contactDictionary(_ contact: CNContact, fields: Set<String>) -> [String: Any] {
  var out: [String: Any] = [
    "id": contact.identifier,
  ]

  if fields.contains("name") {
    out["name"] = [
      "givenName": contact.givenName,
      "middleName": contact.middleName,
      "familyName": contact.familyName,
      "nickname": contact.nickname,
      "displayName": CNContactFormatter.string(from: contact, style: .fullName) ?? "",
    ]
  }

  if fields.contains("phones") && contact.isKeyAvailable(CNContactPhoneNumbersKey) {
    out["phones"] = contact.phoneNumbers.map { value in
      ["label": CNLabeledValue<NSString>.localizedString(forLabel: value.label ?? ""), "value": value.value.stringValue]
    }
  }
  if fields.contains("emails") && contact.isKeyAvailable(CNContactEmailAddressesKey) {
    out["emails"] = contact.emailAddresses.map { value in
      ["label": CNLabeledValue<NSString>.localizedString(forLabel: value.label ?? ""), "value": String(value.value)]
    }
  }
  if fields.contains("addresses") && contact.isKeyAvailable(CNContactPostalAddressesKey) {
    out["addresses"] = contact.postalAddresses.map { value in
      [
        "label": CNLabeledValue<NSString>.localizedString(forLabel: value.label ?? ""),
        "street": value.value.street,
        "city": value.value.city,
        "region": value.value.state,
        "postalCode": value.value.postalCode,
        "country": value.value.country,
      ]
    }
  }
  if fields.contains("organization") && contact.isKeyAvailable(CNContactOrganizationNameKey) {
    out["organization"] = contact.organizationName
  }
  if fields.contains("birthday") && contact.isKeyAvailable(CNContactBirthdayKey), let birthday = contact.birthday,
     let date = Calendar.current.date(from: birthday) {
    out["birthday"] = ISO8601DateFormatter().string(from: date)
  }
  if fields.contains("note") && contact.isKeyAvailable(CNContactNoteKey) {
    out["note"] = contact.note
  }

  return out
}

private func requestedKeyStrings(_ args: Any?) -> [String] {
  let fields = requestedFields(args)
  var keys: [String] = [CNContactIdentifierKey]

  if fields.contains("name") {
    keys.append(contentsOf: [
      CNContactGivenNameKey,
      CNContactMiddleNameKey,
      CNContactFamilyNameKey,
      CNContactNicknameKey,
    ])
  }
  if fields.contains("phones") {
    keys.append(CNContactPhoneNumbersKey)
  }
  if fields.contains("emails") {
    keys.append(CNContactEmailAddressesKey)
  }
  if fields.contains("addresses") {
    keys.append(CNContactPostalAddressesKey)
  }
  if fields.contains("organization") {
    keys.append(CNContactOrganizationNameKey)
  }
  if fields.contains("birthday") {
    keys.append(CNContactBirthdayKey)
  }
  if fields.contains("note") {
    keys.append(CNContactNoteKey)
  }

  return Array(Set(keys))
}

private func requestedSearch(_ args: Any?) -> String? {
  guard
    let options = args as? [String: Any],
    let search = options["search"] as? String,
    !search.isEmpty
  else {
    return nil
  }

  return search
}

private func contactMatchesSearch(_ contact: CNContact, search: String?) -> Bool {
  guard let search else { return true }
  let displayName = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
  return displayName.localizedCaseInsensitiveContains(search)
}

private func baseFetchKeyStrings() -> [String] {
  return [
    CNContactIdentifierKey,
    CNContactGivenNameKey,
    CNContactMiddleNameKey,
    CNContactFamilyNameKey,
    CNContactNicknameKey,
  ]
}

func registerNativiteContactsPlugin(_ bridge: NativiteBridge) {
  let store = CNContactStore()

  bridge.register(namespace: "contacts", method: "getPermissionStatus") { _, completion in
    completion(.success(permissionResponse(CNContactStore.authorizationStatus(for: .contacts))))
  }

  bridge.register(namespace: "contacts", method: "requestPermissions") { _, completion in
    store.requestAccess(for: .contacts) { _, _ in
      completion(.success(permissionResponse(CNContactStore.authorizationStatus(for: .contacts))))
    }
  }

  bridge.register(namespace: "contacts", method: "queryContacts") { args, completion in
    guard CNContactStore.authorizationStatus(for: .contacts) == .authorized else {
      completion(.failure(contactsError("permission-denied", "Contacts permission has not been granted.", operation: "queryContacts")))
      return
    }

    let fields = requestedFields(args)
    let pageSize = requestedPageSize(args)
    let search = requestedSearch(args)
    let requestKeyStrings = Array(Set(requestedKeyStrings(args) + baseFetchKeyStrings()))
    let requestKeys: [CNKeyDescriptor] = requestKeyStrings.map { $0 as CNKeyDescriptor }
      + [CNContactFormatter.descriptorForRequiredKeys(for: .fullName)]
    let request = CNContactFetchRequest(keysToFetch: requestKeys)
    var contacts: [[String: Any]] = []
    do {
      try store.enumerateContacts(with: request) { contact, stop in
        guard contactMatchesSearch(contact, search: search) else { return }
        contacts.append(contactDictionary(contact, fields: fields))
        if contacts.count >= pageSize {
          stop.pointee = true
        }
      }
      completion(.success(["contacts": contacts]))
    } catch {
      completion(.failure(contactsError("operation-failed", error.localizedDescription, operation: "queryContacts")))
    }
  }

  bridge.register(namespace: "contacts", method: "pickContact") { _, completion in
    completion(.failure(contactsError("unsupported", "The contacts picker is not available in the current Nativite runtime context.", operation: "pickContact")))
  }

  bridge.register(namespace: "contacts", method: "createContact") { _, completion in
    completion(.failure(contactsError("unsupported", "Contact mutation support is not implemented for iOS yet.", operation: "createContact")))
  }

  bridge.register(namespace: "contacts", method: "updateContact") { _, completion in
    completion(.failure(contactsError("unsupported", "Contact mutation support is not implemented for iOS yet.", operation: "updateContact")))
  }

  bridge.register(namespace: "contacts", method: "deleteContact") { _, completion in
    completion(.failure(contactsError("unsupported", "Contact deletion is not implemented for iOS yet.", operation: "deleteContact")))
  }

  bridge.register(namespace: "contacts", method: "listGroups") { _, completion in
    guard CNContactStore.authorizationStatus(for: .contacts) == .authorized else {
      completion(.failure(contactsError("permission-denied", "Contacts permission has not been granted.", operation: "listGroups")))
      return
    }

    do {
      let groups = try store.groups(matching: nil).map { ["id": $0.identifier, "name": $0.name] }
      completion(.success(["groups": groups]))
    } catch {
      completion(.failure(contactsError("operation-failed", error.localizedDescription, operation: "listGroups")))
    }
  }

  bridge.register(namespace: "contacts", method: "exportVCard") { _, completion in
    completion(.failure(contactsError("unsupported", "vCard export is not implemented for iOS yet.", operation: "exportVCard")))
  }
}
