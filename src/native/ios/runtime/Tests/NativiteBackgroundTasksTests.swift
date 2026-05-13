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

  func testRemovePendingPayloadClearsNamespacedPayload() throws {
    let userDefaults = try XCTUnwrap(UserDefaults(suiteName: "NativiteBackgroundTasksTests"))
    userDefaults.removePersistentDomain(forName: "NativiteBackgroundTasksTests")
    let key = NativiteBackgroundTasks.pendingPayloadKey(taskId: "sync-inbox")
    userDefaults.set(#"{"reason":"manual"}"#, forKey: key)

    NativiteBackgroundTasks.removePendingPayload(taskId: "sync-inbox", userDefaults: userDefaults)

    XCTAssertNil(userDefaults.string(forKey: key))
  }

  func testContextScriptInjectsConstrainedHostContext() throws {
    let task = try XCTUnwrap(NativiteBackgroundTasks.loadManifest(bundle: .module).first)
    let script = try XCTUnwrap(
      NativiteBackgroundTasks.contextScript(task: task, payloadJSON: #"{"reason":"test"}"#)
    )

    XCTAssertTrue(script.contains(#"taskId: "sync-inbox""#))
    XCTAssertTrue(script.contains(#"payload: {"reason":"test"}"#))
    XCTAssertTrue(script.contains("storage:"))
    XCTAssertTrue(script.contains("signal: Object.freeze"))
    XCTAssertTrue(script.contains("__nativiteBackgroundStorageGet"))
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

  func testTaskScopedStoragePersistsThroughUserDefaults() throws {
    let userDefaults = try XCTUnwrap(UserDefaults(suiteName: "NativiteBackgroundTasksStorageTests"))
    userDefaults.removePersistentDomain(forName: "NativiteBackgroundTasksStorageTests")

    NativiteBackgroundTasks.writeStoredValue(
      taskId: "sync-inbox",
      key: "cursor",
      value: "abc",
      userDefaults: userDefaults
    )

    XCTAssertEqual(
      NativiteBackgroundTasks.readStoredValue(taskId: "sync-inbox", key: "cursor", userDefaults: userDefaults),
      "abc"
    )

    NativiteBackgroundTasks.removeStoredValue(taskId: "sync-inbox", key: "cursor", userDefaults: userDefaults)
    XCTAssertNil(NativiteBackgroundTasks.readStoredValue(taskId: "sync-inbox", key: "cursor", userDefaults: userDefaults))
  }

  func testStorageKeysEncodeTaskIdAndKeyWithoutDotCollisions() {
    XCTAssertNotEqual(
      NativiteBackgroundTasks.storageKey(taskId: "a.b", key: "c"),
      NativiteBackgroundTasks.storageKey(taskId: "a", key: "b.c")
    )
  }

  func testResultStateParsesRetryEnvelope() throws {
    let result = try XCTUnwrap(
      NativiteBackgroundTasks.resultState(from: #"{"result":{"status":"retry","output":{"reason":"offline"}}}"#)
    )

    XCTAssertEqual(result.status, "retry")
    XCTAssertEqual(result.output?.value as? [String: String], ["reason": "offline"])
    XCTAssertFalse(NativiteBackgroundTasks.resultSucceeded(result))
  }

  func testPersistedStateRoundTripsVersionedTaskMetadata() throws {
    let state = NativiteBackgroundTaskPersistedState(
      version: 1,
      id: "sync-inbox",
      state: "completed",
      runCount: 2,
      retryCount: 1,
      lastRunAt: "2026-05-13T12:00:00Z",
      lastResult: NativiteBackgroundTaskResultState(status: "success", output: AnyCodable(["count": 2])),
      lastError: nil
    )

    let encoded = try JSONEncoder().encode(state)
    let decoded = try JSONDecoder().decode(NativiteBackgroundTaskPersistedState.self, from: encoded)

    XCTAssertEqual(decoded, state)
  }

  func testPersistedStateEncodesLastRunAtAsString() throws {
    let state = NativiteBackgroundTaskPersistedState(
      version: 1,
      id: "sync-inbox",
      state: "completed",
      runCount: 1,
      retryCount: 0,
      lastRunAt: "2026-05-13T12:00:00Z",
      lastResult: nil,
      lastError: nil
    )
    let encoded = try JSONEncoder().encode(state)
    let object = try XCTUnwrap(
      JSONSerialization.jsonObject(with: encoded) as? [String: Any]
    )

    XCTAssertEqual(object["id"] as? String, "sync-inbox")
    XCTAssertEqual(object["state"] as? String, "completed")
    XCTAssertNil(object["taskId"])
    XCTAssertNil(object["scheduleState"])
    XCTAssertEqual(object["lastRunAt"] as? String, "2026-05-13T12:00:00Z")
  }

  func testPersistedStateEncodesLastResultOutputUnderPublicContractKey() throws {
    let state = NativiteBackgroundTaskPersistedState(
      version: 1,
      id: "sync-inbox",
      state: "failed",
      runCount: 1,
      retryCount: 1,
      lastRunAt: "2026-05-13T12:00:00Z",
      lastResult: NativiteBackgroundTaskResultState(
        status: "retry",
        output: AnyCodable(["reason": "offline"])
      ),
      lastError: nil
    )
    let encoded = try JSONEncoder().encode(state)
    let object = try XCTUnwrap(
      JSONSerialization.jsonObject(with: encoded) as? [String: Any]
    )
    let lastResult = try XCTUnwrap(object["lastResult"] as? [String: Any])
    let output = try XCTUnwrap(lastResult["output"] as? [String: String])

    XCTAssertEqual(output, ["reason": "offline"])
    XCTAssertNil(lastResult["outputJSON"])
  }

  func testPersistedStateWritesToEncodedTaskStateKey() throws {
    let userDefaults = try XCTUnwrap(UserDefaults(suiteName: "NativiteBackgroundTasksStateTests"))
    userDefaults.removePersistentDomain(forName: "NativiteBackgroundTasksStateTests")
    let state = NativiteBackgroundTaskPersistedState(
      version: 1,
      id: "sync.inbox",
      state: "failed",
      runCount: 1,
      retryCount: 1,
      lastRunAt: nil,
      lastResult: NativiteBackgroundTaskResultState(status: "retry", output: nil),
      lastError: nil
    )

    NativiteBackgroundTasks.writePersistedState(state, userDefaults: userDefaults)

    XCTAssertEqual(
      NativiteBackgroundTasks.readPersistedState(taskId: "sync.inbox", userDefaults: userDefaults),
      state
    )
  }

  func testPersistedStateReadsLegacyTaskIdAndScheduleStateKeys() throws {
    let data = """
      {
        "version": 1,
        "taskId": "sync-inbox",
        "scheduleState": "completed",
        "runCount": 2,
        "retryCount": 1
      }
      """.data(using: .utf8)!

    let state = try JSONDecoder().decode(NativiteBackgroundTaskPersistedState.self, from: data)

    XCTAssertEqual(state.id, "sync-inbox")
    XCTAssertEqual(state.state, "completed")
    XCTAssertEqual(state.runCount, 2)
    XCTAssertEqual(state.retryCount, 1)
  }

  private func decodePlatformMetadata(_ json: String) throws -> AnyCodable {
    try JSONDecoder().decode(AnyCodable.self, from: Data(json.utf8))
  }
}
