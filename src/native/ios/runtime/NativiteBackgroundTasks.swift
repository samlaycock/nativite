import Foundation

struct NativiteBackgroundTask: Decodable, Equatable {
  let id: String
  let bundle: String
  let platforms: [String: AnyCodable]
}

enum NativiteBackgroundTasks {
  static let manifestResourceName = "manifest"
  static let manifestResourceExtension = "json"
  static let manifestSubdirectory = "nativite-background"

  static func loadManifest(bundle: Bundle = .main) throws -> [NativiteBackgroundTask] {
    guard let url = bundle.url(
      forResource: manifestResourceName,
      withExtension: manifestResourceExtension,
      subdirectory: manifestSubdirectory
    ) else {
      return []
    }

    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(Manifest.self, from: data).tasks
  }

  private struct Manifest: Decodable {
    let version: Int
    let tasks: [NativiteBackgroundTask]
  }
}

struct AnyCodable: Decodable, Equatable {
  let value: Any

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()

    if container.decodeNil() {
      value = NSNull()
    } else if let bool = try? container.decode(Bool.self) {
      value = bool
    } else if let int = try? container.decode(Int.self) {
      value = int
    } else if let double = try? container.decode(Double.self) {
      value = double
    } else if let string = try? container.decode(String.self) {
      value = string
    } else if let array = try? container.decode([AnyCodable].self) {
      value = array.map(\.value)
    } else if let object = try? container.decode([String: AnyCodable].self) {
      value = object.mapValues(\.value)
    } else {
      throw DecodingError.dataCorruptedError(
        in: container,
        debugDescription: "Unsupported background task metadata value."
      )
    }
  }

  static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
    valuesEqual(lhs.value, rhs.value)
  }

  private init(unchecked value: Any) {
    self.value = value
  }

  private static func valuesEqual(_ lhs: Any, _ rhs: Any) -> Bool {
    switch (lhs, rhs) {
    case (is NSNull, is NSNull):
      return true
    case (let lhs as Bool, let rhs as Bool):
      return lhs == rhs
    case (let lhs as Int, let rhs as Int):
      return lhs == rhs
    case (let lhs as Double, let rhs as Double):
      return lhs == rhs
    case (let lhs as String, let rhs as String):
      return lhs == rhs
    case (let lhs as [Any], let rhs as [Any]):
      guard lhs.count == rhs.count else { return false }
      return zip(lhs, rhs).allSatisfy { valuesEqual($0, $1) }
    case (let lhs as [String: Any], let rhs as [String: Any]):
      guard lhs.count == rhs.count else { return false }
      return lhs.allSatisfy { key, lhsValue in
        rhs[key].map { valuesEqual(lhsValue, $0) } ?? false
      }
    default:
      return false
    }
  }
}
