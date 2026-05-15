#if os(iOS)
import Foundation

func registerNativiteBackgroundBridge(_ bridge: NativiteBridge) {
  let scheduler = NativiteBackgroundTaskScheduler()

  bridge.register(namespace: "__background__", method: "schedule") { args, completion in
    let dict = args as? [String: Any]
    let taskId = dict?["id"] as? String ?? ""
    let payloadJSON = dict?["payload"] as? String

    do {
      completion(.success(try scheduler.schedule(id: taskId, payloadJSON: payloadJSON)))
    } catch {
      completion(.failure(error))
    }
  }

  bridge.register(namespace: "__background__", method: "cancel") { args, completion in
    let taskId = (args as? [String: Any])?["id"] as? String ?? ""
    completion(.success(scheduler.cancel(id: taskId)))
  }

  bridge.register(namespace: "__background__", method: "getStatus") { args, completion in
    let taskId = (args as? [String: Any])?["id"] as? String ?? ""
    scheduler.status(id: taskId, completion: completion)
  }
}
#endif
