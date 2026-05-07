export interface MainEntryOptions {
  /** macOS toolbar style: "unified" (default) or "expanded". */
  readonly toolbarStyle?: "unified" | "expanded";
}

export function mainEntryTemplate(options?: MainEntryOptions): string {
  const toolbarStyle = options?.toolbarStyle ?? "unified";
  const windowToolbarStyleModifier =
    toolbarStyle === "expanded"
      ? ".windowToolbarStyle(.expanded)"
      : ".windowToolbarStyle(.unified)";

  return `import SwiftUI

@main
struct NativiteApp: App {
  #if os(macOS)
  @NSApplicationDelegateAdaptor(NativiteAppDelegate.self) var appDelegate
  #endif
  @State private var chromeState = NativiteChromeState()

  var body: some Scene {
    WindowGroup {
      NativiteRootView(chromeState: chromeState)
    }
    #if os(macOS)
    .commands {
      NativiteMenuBarCommands(chromeState: chromeState)
    }
    .defaultSize(width: 1024, height: 768)
    ${windowToolbarStyleModifier}
    #endif
  }
}
`;
}
