export function mainEntryTemplate(): string {
  return `import SwiftUI

@main
struct NativiteApp: App {
  #if os(macOS)
  @NSApplicationDelegateAdaptor(NativiteAppDelegate.self) var appDelegate
  #endif

  var body: some Scene {
    WindowGroup {
      NativiteRootView()
    }
    #if os(macOS)
    .defaultSize(width: 1024, height: 768)
    #endif
  }
}
`;
}
