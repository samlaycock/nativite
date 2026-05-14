import Contacts
import ContactsUI
import Foundation

private let nativiteContactsErrorDomain = "NativiteContacts"

private func contactsError(_ code: String, _ message: String, operation: String) -> NSError {
  NSError(
    domain: nativiteContactsErrorDomain,
    code: 1,
    userInfo: [
      NSLocalizedDescriptionKey:
        "{\"code\":\"\(code)\",\"message\":\"\(message)\",\"platform\":\"ios\",\"operation\":\"\(operation)\"}"
    ]
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

private func contactDictionary(_ contact: CNContact) -> [String: Any] {
  var out: [String: Any] = [
    "id": contact.identifier,
    "name": [
      "givenName": contact.givenName,
      "middleName": contact.middleName,
      "familyName": contact.familyName,
      "nickname": contact.nickname,
      "displayName": CNContactFormatter.string(from: contact, style: .fullName) ?? "",
    ],
  ]

  if contact.isKeyAvailable(CNContactPhoneNumbersKey) {
    out["phones"] = contact.phoneNumbers.map { value in
      ["label": CNLabeledValue<NSString>.localizedString(forLabel: value.label ?? ""), "value": value.value.stringValue]
    }
  }
  if contact.isKeyAvailable(CNContactEmailAddressesKey) {
    out["emails"] = contact.emailAddresses.map { value in
      ["label": CNLabeledValue<NSString>.localizedString(forLabel: value.label ?? ""), "value": String(value.value)]
    }
  }
  if contact.isKeyAvailable(CNContactOrganizationNameKey) {
    out["organization"] = contact.organizationName
  }
  if contact.isKeyAvailable(CNContactNoteKey) {
    out["note"] = contact.note
  }

  return out
}

private func requestedKeys(_ args: Any?) -> [CNKeyDescriptor] {
  [
    CNContactIdentifierKey,
    CNContactGivenNameKey,
    CNContactMiddleNameKey,
    CNContactFamilyNameKey,
    CNContactNicknameKey,
    CNContactPhoneNumbersKey,
    CNContactEmailAddressesKey,
    CNContactOrganizationNameKey,
    CNContactNoteKey,
  ].map { $0 as CNKeyDescriptor }
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

    let request = CNContactFetchRequest(keysToFetch: requestedKeys(args))
    var contacts: [[String: Any]] = []
    do {
      try store.enumerateContacts(with: request) { contact, _ in
        contacts.append(contactDictionary(contact))
      }
      completion(.success(["contacts": contacts]))
    } catch {
      completion(.failure(error))
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
    do {
      let groups = try store.groups(matching: nil).map { ["id": $0.identifier, "name": $0.name] }
      completion(.success(["groups": groups]))
    } catch {
      completion(.failure(error))
    }
  }

  bridge.register(namespace: "contacts", method: "exportVCard") { _, completion in
    completion(.failure(contactsError("unsupported", "vCard export is not implemented for iOS yet.", operation: "exportVCard")))
  }
}
