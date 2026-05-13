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

  static func contextScript(task: NativiteBackgroundTask, payloadJSON: String? = nil) -> String {
    let payload = payloadJSON ?? "undefined"
    return """
      ({
        taskId: \(jsonString(task.id)),
        payload: \(payload),
        storage: {
          async get(_key) { return null },
          async set(_key, _value) {},
          async remove(_key) {}
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

  private struct Manifest: Decodable {
    let version: Int
    let tasks: [NativiteBackgroundTask]
  }
}

#if os(iOS)
final class NativiteBackgroundTaskRuntime {
  private let bundle: Bundle
  private let tasks: [NativiteBackgroundTask]

  init(bundle: Bundle = .main) throws {
    self.bundle = bundle
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
        self?.handleAppRefreshTask(refreshTask)
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
    bgTask.expirationHandler = {
      completion.complete(false)
    }

    execute(task: task) { success in
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

  private func execute(
    task: NativiteBackgroundTask,
    payloadJSON: String? = nil,
    completion: @escaping (Bool) -> Void
  ) {
    guard
      let url = NativiteBackgroundTasks.bundleURL(for: task, bundle: bundle),
      let source = try? String(contentsOf: url, encoding: .utf8),
      let context = JSContext()
    else {
      completion(false)
      return
    }

    context.exceptionHandler = { _, exception in
      print("[nativite-background] JavaScript exception: \(exception?.toString() ?? "unknown")")
    }
    installConsole(in: context)
    context.evaluateScript(NativiteBackgroundTasks.executableBundleSource(source))

    guard context.exception == nil else {
      completion(false)
      return
    }

    let contextValue = context.evaluateScript(NativiteBackgroundTasks.contextScript(
      task: task,
      payloadJSON: payloadJSON
    ))
    let invocation = """
      (async () => {
        const task = globalThis.default || globalThis.__nativiteBackgroundTask;
        if (!task || typeof task.run !== 'function') {
          throw new Error('Background task bundle did not expose a default run(ctx) function.');
        }
        await task.run(__nativiteContext);
      })()
      """
    context.setObject(contextValue, forKeyedSubscript: "__nativiteContext" as NSString)
    let result = context.evaluateScript(invocation)

    if let promise = result, promise.hasProperty("then") {
      promise.invokeMethod("then", withArguments: [
        JSValue(object: { completion(true) }, in: context) as Any,
        JSValue(object: { (_ error: JSValue?) in
          print("[nativite-background] JavaScript rejection: \(error?.toString() ?? "unknown")")
          completion(false)
        }, in: context) as Any,
      ])
    } else {
      completion(context.exception == nil)
    }
  }

  private func installConsole(in context: JSContext) {
    let log: @convention(block) (String) -> Void = { message in
      print("[nativite-background] \(message)")
    }
    context.setObject(log, forKeyedSubscript: "__nativiteLog" as NSString)
    context.evaluateScript("""
      globalThis.console = {
        debug: (...args) => __nativiteLog(args.map(String).join(' ')),
        error: (...args) => __nativiteLog(args.map(String).join(' ')),
        info: (...args) => __nativiteLog(args.map(String).join(' ')),
        warn: (...args) => __nativiteLog(args.map(String).join(' '))
      };
      """)
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
#endif

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
