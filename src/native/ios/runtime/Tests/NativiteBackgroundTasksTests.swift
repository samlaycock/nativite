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
}
