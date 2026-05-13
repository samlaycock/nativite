import Foundation
#if os(iOS)
import BackgroundTasks
import JavaScriptCore
#endif

struct NativiteBackgroundTask: Decodable, Equatable {
  let id: String
  let bundle: String
  let platforms: [String: AnyCodable]

  var iOSKind: String? {
    guard let ios = platforms["ios"]?.value as? [String: Any] else { return nil }
    return ios["kind"] as? String
  }
}

enum NativiteBackgroundTasks {
  static let manifestResourceName = "manifest"
  static let manifestResourceExtension = "json"
  static let manifestSubdirectory = "nativite-background"
  static let pendingPayloadKeyPrefix = "dev.nativite.background.pendingPayload."
  static let storageKeyPrefix = "dev.nativite.background.storage."
  static let stateKeyPrefix = "dev.nativite.background.state."

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

  static func supportedIOSTasks(from tasks: [NativiteBackgroundTask]) -> [NativiteBackgroundTask] {
    tasks.filter { $0.iOSKind == "app-refresh" }
  }

  static func task(id: String, in tasks: [NativiteBackgroundTask]) -> NativiteBackgroundTask? {
    tasks.first { $0.id == id }
  }

  static func bundleURL(for task: NativiteBackgroundTask, bundle: Bundle = .main) -> URL? {
    bundle.url(
      forResource: task.bundle,
      withExtension: nil,
      subdirectory: manifestSubdirectory
    )
  }

  static func pendingPayloadKey(taskId: String) -> String {
    "\(pendingPayloadKeyPrefix)\(taskId)"
  }

  static func removePendingPayload(taskId: String, userDefaults: UserDefaults = .standard) {
    userDefaults.removeObject(forKey: pendingPayloadKey(taskId: taskId))
  }

  static func contextScript(task: NativiteBackgroundTask, payloadJSON: String? = nil) -> String? {
    guard let payload = payloadLiteral(payloadJSON) else { return nil }
    return """
      ({
        taskId: \(jsonString(task.id)),
        payload: \(payload),
        signal: Object.freeze({ aborted: false }),
        storage: {
          async get(key) { return __nativiteBackgroundStorageGet(\(jsonString(task.id)), String(key)); },
          async set(key, value) { __nativiteBackgroundStorageSet(\(jsonString(task.id)), String(key), String(value)); },
          async remove(key) { __nativiteBackgroundStorageRemove(\(jsonString(task.id)), String(key)); }
        },
        fetch: globalThis.fetch,
        log: {
          debug: (...args) => console.debug(...args),
          error: (...args) => console.error(...args),
          info: (...args) => console.info(...args),
          warn: (...args) => console.warn(...args)
        }
      })
      """
  }

  private static func payloadLiteral(_ payloadJSON: String?) -> String? {
    guard let payloadJSON else { return "undefined" }
    guard let data = payloadJSON.data(using: .utf8) else { return nil }

    do {
      _ = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
      return payloadJSON
    } catch {
      return nil
    }
  }

  static func executableBundleSource(_ source: String) -> String {
    if let transformed = transformDefaultExport(source) {
      return transformed
    }

    return source
  }

  private static func transformDefaultExport(_ source: String) -> String? {
    let pattern = #"export\s*\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+default\s*\};?"#
    guard
      let regex = try? NSRegularExpression(pattern: pattern),
      let match = regex.firstMatch(
        in: source,
        range: NSRange(source.startIndex..<source.endIndex, in: source)
      ),
      let bindingRange = Range(match.range(at: 1), in: source),
      let exportRange = Range(match.range(at: 0), in: source)
    else {
      return nil
    }

    let binding = source[bindingRange]
    var transformed = source
    transformed.replaceSubrange(
      exportRange,
      with: "globalThis.__nativiteBackgroundTask = \(binding);"
    )
    return transformed
  }

  private static func jsonString(_ value: String) -> String {
    let data = try? JSONEncoder().encode(value)
    return data.flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
  }

  static func storageKey(taskId: String, key: String) -> String {
    "\(storageKeyPrefix)\(keyComponent(taskId))/\(keyComponent(key))"
  }

  static func readStoredValue(taskId: String, key: String, userDefaults: UserDefaults = .standard) -> String? {
    userDefaults.string(forKey: storageKey(taskId: taskId, key: key))
  }

  static func writeStoredValue(
    taskId: String,
    key: String,
    value: String,
    userDefaults: UserDefaults = .standard
  ) {
    userDefaults.set(value, forKey: storageKey(taskId: taskId, key: key))
  }

  static func removeStoredValue(taskId: String, key: String, userDefaults: UserDefaults = .standard) {
    userDefaults.removeObject(forKey: storageKey(taskId: taskId, key: key))
  }

  static func stateKey(taskId: String) -> String {
    "\(stateKeyPrefix)\(keyComponent(taskId))"
  }

  static func readPersistedState(
    taskId: String,
    userDefaults: UserDefaults = .standard
  ) -> NativiteBackgroundTaskPersistedState? {
    guard let data = userDefaults.data(forKey: stateKey(taskId: taskId)) else { return nil }
    return try? JSONDecoder().decode(NativiteBackgroundTaskPersistedState.self, from: data)
  }

  static func writePersistedState(
    _ state: NativiteBackgroundTaskPersistedState,
    userDefaults: UserDefaults = .standard
  ) {
    guard let data = try? JSONEncoder().encode(state) else { return }
    userDefaults.set(data, forKey: stateKey(taskId: state.taskId))
  }

  static func resultState(from envelopeJSON: String?) -> NativiteBackgroundTaskResultState? {
    guard
      let envelopeJSON,
      let data = envelopeJSON.data(using: .utf8),
      let envelope = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? [String: Any],
      let result = envelope["result"]
    else {
      return nil
    }

    if let status = result as? String {
      return NativiteBackgroundTaskResultState(status: status, output: nil)
    }

    guard let object = result as? [String: Any] else {
      return NativiteBackgroundTaskResultState(status: "success", output: AnyCodable(result))
    }

    return NativiteBackgroundTaskResultState(
      status: object["status"] as? String,
      output: object["output"].map(AnyCodable.init)
    )
  }

  static func resultSucceeded(_ result: NativiteBackgroundTaskResultState?) -> Bool {
    result?.status != "failure" && result?.status != "retry"
  }

  private static func keyComponent(_ value: String) -> String {
    Data(value.utf8)
      .base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private struct Manifest: Decodable {
    let version: Int
    let tasks: [NativiteBackgroundTask]
  }
}

struct NativiteBackgroundTaskResultState: Codable, Equatable {
  let status: String?
  let output: AnyCodable?
}

struct NativiteBackgroundTaskPersistedState: Codable, Equatable {
  let version: Int
  let taskId: String
  let scheduleState: String
  let runCount: Int
  let retryCount: Int
  let lastRunAt: String?
  let lastResult: NativiteBackgroundTaskResultState?
  let lastError: String?
}

#if os(iOS)
final class NativiteBackgroundTaskRuntime {
  private let bundle: Bundle
  private let userDefaults: UserDefaults
  private let tasks: [NativiteBackgroundTask]
  private let activeContextLock = NSLock()
  private var activeContexts: [UUID: JSContext] = [:]

  init(bundle: Bundle = .main, userDefaults: UserDefaults = .standard) throws {
    self.bundle = bundle
    self.userDefaults = userDefaults
    self.tasks = try NativiteBackgroundTasks.loadManifest(bundle: bundle)
  }

  func registerAppRefreshTasks(
    scheduler: BGTaskScheduler = .shared,
    queue: DispatchQueue? = nil
  ) {
    for task in NativiteBackgroundTasks.supportedIOSTasks(from: tasks) {
      scheduler.register(forTaskWithIdentifier: task.id, using: queue) { [weak self] bgTask in
        guard let refreshTask = bgTask as? BGAppRefreshTask else {
          bgTask.setTaskCompleted(success: false)
          return
        }
        guard let self else {
          bgTask.setTaskCompleted(success: false)
          return
        }
        self.handleAppRefreshTask(refreshTask)
      }
    }
  }

  private func handleAppRefreshTask(_ bgTask: BGAppRefreshTask) {
    guard let task = NativiteBackgroundTasks.task(id: bgTask.identifier, in: tasks) else {
      bgTask.setTaskCompleted(success: false)
      return
    }

    let completion = CompletionOnce { success in
      bgTask.setTaskCompleted(success: success)
    }
    var executionID: UUID?
    bgTask.expirationHandler = { [weak self] in
      if let executionID {
        self?.releaseContext(id: executionID)
      }
      NativiteBackgroundTasks.removePendingPayload(taskId: task.id, userDefaults: self?.userDefaults ?? .standard)
      completion.complete(false)
    }

    let payloadJSON = userDefaults.string(
      forKey: NativiteBackgroundTasks.pendingPayloadKey(taskId: task.id)
    )
    executionID = execute(task: task, payloadJSON: payloadJSON) { success in
      NativiteBackgroundTasks.removePendingPayload(taskId: task.id, userDefaults: self.userDefaults)
      completion.complete(success)
    }
  }

  func executeTask(
    id taskId: String,
    payloadJSON: String? = nil,
    completion: @escaping (Bool) -> Void
  ) {
    guard let task = NativiteBackgroundTasks.task(id: taskId, in: tasks) else {
      completion(false)
      return
    }

    execute(task: task, payloadJSON: payloadJSON, completion: completion)
  }

  @discardableResult
  private func execute(
    task: NativiteBackgroundTask,
    payloadJSON: String? = nil,
    completion: @escaping (Bool) -> Void
  ) -> UUID? {
    guard
      let url = NativiteBackgroundTasks.bundleURL(for: task, bundle: bundle),
      let source = try? String(contentsOf: url, encoding: .utf8),
      let context = JSContext()
    else {
      completion(false)
      return nil
    }
    let contextID = retainContext(context)
    let finish: (Bool, NativiteBackgroundTaskResultState?, String?) -> Void = { [weak self] success, result, error in
      self?.recordTaskState(taskId: task.id, success: success, result: result, error: error)
      self?.releaseContext(id: contextID)
      completion(success)
    }

    context.exceptionHandler = { _, exception in
      print("[nativite-background] JavaScript exception: \(exception?.toString() ?? "unknown")")
    }
    installConsole(in: context)
    installStorage(in: context)
    context.evaluateScript(NativiteBackgroundTasks.executableBundleSource(source))

    guard context.exception == nil else {
      finish(false, nil, context.exception?.toString())
      return contextID
    }

    guard
      let contextScript = NativiteBackgroundTasks.contextScript(
        task: task,
        payloadJSON: payloadJSON
      ),
      let contextValue = context.evaluateScript(contextScript)
    else {
      finish(false, nil, "Background task context could not be created.")
      return contextID
    }
    let invocation = """
      (async () => {
        const task = globalThis.default || globalThis.__nativiteBackgroundTask;
        if (!task || typeof task.run !== 'function') {
          throw new Error('Background task bundle did not expose a default run(ctx) function.');
        }
        const result = await task.run(__nativiteContext);
        return JSON.stringify({ result });
      })()
      """
    context.setObject(contextValue, forKeyedSubscript: "__nativiteContext" as NSString)
    let result = context.evaluateScript(invocation)

    if let promise = result, promise.hasProperty("then") {
      promise.invokeMethod("then", withArguments: [
        JSValue(object: { (envelope: JSValue?) in
          let taskResult = NativiteBackgroundTasks.resultState(from: envelope?.toString())
          finish(NativiteBackgroundTasks.resultSucceeded(taskResult), taskResult, nil)
        }, in: context) as Any,
        JSValue(object: { (_ error: JSValue?) in
          print("[nativite-background] JavaScript rejection: \(error?.toString() ?? "unknown")")
          finish(false, nil, error?.toString())
        }, in: context) as Any,
      ])
    } else {
      finish(context.exception == nil, nil, context.exception?.toString())
    }
    return contextID
  }

  private func recordTaskState(
    taskId: String,
    success: Bool,
    result: NativiteBackgroundTaskResultState?,
    error: String?
  ) {
    let previous = NativiteBackgroundTasks.readPersistedState(taskId: taskId, userDefaults: userDefaults)
    let retryCount = result?.status == "retry" ? (previous?.retryCount ?? 0) + 1 : previous?.retryCount ?? 0
    NativiteBackgroundTasks.writePersistedState(
      NativiteBackgroundTaskPersistedState(
        version: 1,
        taskId: taskId,
        scheduleState: success ? "completed" : "failed",
        runCount: (previous?.runCount ?? 0) + 1,
        retryCount: retryCount,
        lastRunAt: ISO8601DateFormatter().string(from: Date()),
        lastResult: result,
        lastError: error
      ),
      userDefaults: userDefaults
    )
  }

  private func installConsole(in context: JSContext) {
    let log: @convention(block) (String) -> Void = { message in
      print("[nativite-background] \(message)")
    }
    context.setObject(log, forKeyedSubscript: "__nativiteLog" as NSString)
    context.evaluateScript("""
      globalThis.console = {
        log: (...args) => __nativiteLog(args.map(String).join(' ')),
        debug: (...args) => __nativiteLog(args.map(String).join(' ')),
        error: (...args) => __nativiteLog(args.map(String).join(' ')),
        info: (...args) => __nativiteLog(args.map(String).join(' ')),
        warn: (...args) => __nativiteLog(args.map(String).join(' '))
      };
      """)
  }

  private func installStorage(in context: JSContext) {
    let get: @convention(block) (String, String) -> String? = { [weak self] taskId, key in
      NativiteBackgroundTasks.readStoredValue(
        taskId: taskId,
        key: key,
        userDefaults: self?.userDefaults ?? .standard
      )
    }
    let set: @convention(block) (String, String, String) -> Void = { [weak self] taskId, key, value in
      NativiteBackgroundTasks.writeStoredValue(
        taskId: taskId,
        key: key,
        value: value,
        userDefaults: self?.userDefaults ?? .standard
      )
    }
    let remove: @convention(block) (String, String) -> Void = { [weak self] taskId, key in
      NativiteBackgroundTasks.removeStoredValue(
        taskId: taskId,
        key: key,
        userDefaults: self?.userDefaults ?? .standard
      )
    }
    context.setObject(get, forKeyedSubscript: "__nativiteBackgroundStorageGet" as NSString)
    context.setObject(set, forKeyedSubscript: "__nativiteBackgroundStorageSet" as NSString)
    context.setObject(remove, forKeyedSubscript: "__nativiteBackgroundStorageRemove" as NSString)
  }

  private func retainContext(_ context: JSContext) -> UUID {
    let id = UUID()
    activeContextLock.lock()
    activeContexts[id] = context
    activeContextLock.unlock()
    return id
  }

  private func releaseContext(id: UUID) {
    activeContextLock.lock()
    activeContexts[id] = nil
    activeContextLock.unlock()
  }
}

private final class CompletionOnce {
  private let lock = NSLock()
  private var completed = false
  private let callback: (Bool) -> Void

  init(_ callback: @escaping (Bool) -> Void) {
    self.callback = callback
  }

  func complete(_ success: Bool) {
    lock.lock()
    defer { lock.unlock() }
    guard !completed else { return }
    completed = true
    callback(success)
  }
}

final class NativiteBackgroundTaskScheduler {
  private let bundle: Bundle
  private let scheduler: BGTaskScheduler
  private let userDefaults: UserDefaults

  init(
    bundle: Bundle = .main,
    scheduler: BGTaskScheduler = .shared,
    userDefaults: UserDefaults = .standard
  ) {
    self.bundle = bundle
    self.scheduler = scheduler
    self.userDefaults = userDefaults
  }

  func schedule(id taskId: String, payloadJSON: String? = nil) throws -> [String: Any] {
    let task = try taskDefinition(id: taskId)
    guard task.iOSKind == "app-refresh" else {
      throw NSError(
        domain: "NativiteBackgroundTasks",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Background task \(taskId) is not supported on iOS."]
      )
    }

    if let payloadJSON, NativiteBackgroundTasks.contextScript(task: task, payloadJSON: payloadJSON) == nil {
      throw NSError(
        domain: "NativiteBackgroundTasks",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Background task payload must be JSON serializable."]
      )
    }

    let request = BGAppRefreshTaskRequest(identifier: task.id)
    try scheduler.submit(request)
    let payloadKey = NativiteBackgroundTasks.pendingPayloadKey(taskId: task.id)
    if let payloadJSON {
      userDefaults.set(payloadJSON, forKey: payloadKey)
    } else {
      userDefaults.removeObject(forKey: payloadKey)
    }
    return ["id": task.id, "state": "scheduled", "platform": "ios"]
  }

  func cancel(id taskId: String) -> [String: Any] {
    scheduler.cancel(taskRequestWithIdentifier: taskId)
    NativiteBackgroundTasks.removePendingPayload(taskId: taskId, userDefaults: userDefaults)
    return ["id": taskId, "state": "cancelled", "platform": "ios"]
  }

  func status(id taskId: String, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    scheduler.getPendingTaskRequests { requests in
      let state = requests.contains { $0.identifier == taskId } ? "scheduled" : "unknown"
      completion(.success(["id": taskId, "state": state, "platform": "ios"]))
    }
  }

  private func taskDefinition(id taskId: String) throws -> NativiteBackgroundTask {
    let tasks = try NativiteBackgroundTasks.loadManifest(bundle: bundle)
    if let task = NativiteBackgroundTasks.task(id: taskId, in: tasks) {
      return task
    }
    throw NSError(
      domain: "NativiteBackgroundTasks",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "Unknown Nativite background task: \(taskId)"]
    )
  }
}
#endif

struct AnyCodable: Codable, Equatable {
  let value: Any

  init(_ value: Any) {
    self.value = value
  }

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

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()

    switch value {
    case is NSNull:
      try container.encodeNil()
    case let bool as Bool:
      try container.encode(bool)
    case let int as Int:
      try container.encode(int)
    case let double as Double:
      try container.encode(double)
    case let string as String:
      try container.encode(string)
    case let array as [Any]:
      try container.encode(array.map(AnyCodable.init))
    case let object as [String: Any]:
      try container.encode(object.mapValues(AnyCodable.init))
    default:
      throw EncodingError.invalidValue(
        value,
        EncodingError.Context(
          codingPath: encoder.codingPath,
          debugDescription: "Unsupported background task metadata value."
        )
      )
    }
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
