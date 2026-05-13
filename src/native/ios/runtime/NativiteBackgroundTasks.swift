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
    String(describing: lhs.value) == String(describing: rhs.value)
  }
}
