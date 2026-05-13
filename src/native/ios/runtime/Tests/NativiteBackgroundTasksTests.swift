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

  func testSupportedIOSTasksIncludesOnlyAppRefreshTasks() throws {
    let tasks = try NativiteBackgroundTasks.loadManifest(bundle: .module)

    XCTAssertEqual(NativiteBackgroundTasks.supportedIOSTasks(from: tasks).map(\.id), ["sync-inbox"])
  }

  func testTaskLookupFindsRegisteredTaskById() throws {
    let tasks = try NativiteBackgroundTasks.loadManifest(bundle: .module)

    XCTAssertEqual(NativiteBackgroundTasks.task(id: "sync-inbox", in: tasks)?.bundle, "sync-inbox.js")
    XCTAssertNil(NativiteBackgroundTasks.task(id: "missing", in: tasks))
  }

  func testPendingPayloadKeyIsNamespacedByTaskId() {
    XCTAssertEqual(
      NativiteBackgroundTasks.pendingPayloadKey(taskId: "sync-inbox"),
      "dev.nativite.background.pendingPayload.sync-inbox"
    )
  }

  func testContextScriptInjectsConstrainedHostContext() throws {
    let task = try XCTUnwrap(NativiteBackgroundTasks.loadManifest(bundle: .module).first)
    let script = try XCTUnwrap(
      NativiteBackgroundTasks.contextScript(task: task, payloadJSON: #"{"reason":"test"}"#)
    )

    XCTAssertTrue(script.contains(#"taskId: "sync-inbox""#))
    XCTAssertTrue(script.contains(#"payload: {"reason":"test"}"#))
    XCTAssertTrue(script.contains("storage:"))
    XCTAssertTrue(script.contains("fetch: globalThis.fetch"))
    XCTAssertTrue(script.contains("log:"))
  }

  func testContextScriptRejectsInvalidPayloadJSON() throws {
    let task = try XCTUnwrap(NativiteBackgroundTasks.loadManifest(bundle: .module).first)

    XCTAssertNil(NativiteBackgroundTasks.contextScript(task: task, payloadJSON: #"; alert(1);"#))
  }

  func testExecutableBundleSourceExposesBundledDefaultExport() throws {
    let source = """
      var sync_default = { run() {} };
      export { sync_default as default };
      """

    let transformed = NativiteBackgroundTasks.executableBundleSource(source)

    XCTAssertFalse(transformed.contains("export {"))
    XCTAssertTrue(transformed.contains("globalThis.__nativiteBackgroundTask = sync_default;"))
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
