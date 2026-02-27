import type { NativiteConfig } from "../../index.ts";

export function appDelegateTemplate(config: NativiteConfig): string {
  const appName = config.app.name;

  return `#if os(iOS)
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
      window = UIWindow(windowScene: windowScene)
    } else {
      window = UIWindow()
    }
    let nav = UINavigationController(rootViewController: ViewController())
    nav.setNavigationBarHidden(true, animated: false)
    window?.rootViewController = nav
    window?.makeKeyAndVisible()
    return true
  }
}

#elseif os(macOS)
import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {

  var window: NSWindow!

  func applicationDidFinishLaunching(_ notification: Notification) {
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1024, height: 768),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "${appName}"
    window.contentViewController = ViewController()
    window.center()
    window.makeKeyAndOrderFront(nil)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return true
  }
}
#endif
`;
}
