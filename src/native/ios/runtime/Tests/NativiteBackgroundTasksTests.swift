import XCTest
@testable import NativiteRuntime

final class NativiteBackgroundTasksTests: XCTestCase {
  func testLoadManifestParsesBundledTaskMetadata() throws {
    let tasks = try NativiteBackgroundTasks.loadManifest(bundle: .module)

    XCTAssertEqual(tasks.count, 1)
    XCTAssertEqual(tasks[0].id, "sync-inbox")
    XCTAssertEqual(tasks[0].bundle, "sync-inbox.js")
    XCTAssertEqual(tasks[0].platforms["ios"]?.value as? [String: String], ["kind": "app-refresh"])
  }

  func testAnyCodableComparesDictionariesWithoutDependingOnKeyOrder() throws {
    let left = try decodePlatformMetadata(#"{"a":"x","b":{"c":["d",true,1]}}"#)
    let right = try decodePlatformMetadata(#"{"b":{"c":["d",true,1]},"a":"x"}"#)

    XCTAssertEqual(left, right)
  }

  private func decodePlatformMetadata(_ json: String) throws -> AnyCodable {
    try JSONDecoder().decode(AnyCodable.self, from: Data(json.utf8))
  }
}
