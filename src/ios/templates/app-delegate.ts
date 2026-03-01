import type { NativiteConfig } from "../../index.ts";

export function appDelegateTemplate(config: NativiteConfig): string {
  // ── Splash overlay (iOS only) ───────────────────────────────────────────
  // Three states:
  //   1. No config.splash        → systemBackground + ProgressView spinner
  //   2. backgroundColor only    → custom colour, no content
  //   3. backgroundColor + image → custom colour + Image("Splash")
  const splashBgColor = config.splash?.backgroundColor
    ? swiftUIColorFromHex(config.splash.backgroundColor)
    : "Color(uiColor: .systemBackground)";

  const splashContent = config.splash?.image
    ? `
            Image("Splash")
              .resizable()
              .scaledToFit()
              .frame(
                maxWidth: UIScreen.main.bounds.width * 0.8,
                maxHeight: UIScreen.main.bounds.height * 0.8
              )`
    : config.splash
      ? "" // backgroundColor only — no inner content
      : `
            ProgressView()
              .controlSize(.large)
              .tint(Color(uiColor: .secondaryLabel))`;

  const splashOverlay = `
      if chromeState.splashVisible {
        ${splashBgColor}
          .ignoresSafeArea()${splashContent ? `\n          .overlay {${splashContent}\n          }` : ""}
          .transition(.opacity)
          .zIndex(1)
      }`;

  return `import SwiftUI
import WebKit
#if os(iOS)
import UIKit
#elseif os(macOS)
import Cocoa
#endif

// ─── NativiteRootView ─────────────────────────────────────────────────────────
// SwiftUI host view that owns the NativiteChromeState observable model and
// applies SwiftUI-driven chrome modifiers (navigation bar, toolbar, sheets,
// alerts, status bar, etc.). The underlying UIKit/AppKit ViewController is
// embedded via a Representable.

#if os(iOS)
struct NativiteRootView: View {
  @State private var chromeState = NativiteChromeState()

  var body: some View {
    ZStack {
      NavigationStack {
        NativiteViewControllerRepresentable(chromeState: chromeState)
          .ignoresSafeArea()
          .nativiteTitleBar(chromeState: chromeState)
          .nativiteToolbar(chromeState: chromeState)
      }
      .nativiteSheets(chromeState: chromeState)
      .nativiteAlerts(chromeState: chromeState)
${splashOverlay}
    }
    .animation(.easeOut(duration: 0.2), value: chromeState.splashVisible)
  }
}
#else
struct NativiteRootView: View {
  @State private var chromeState = NativiteChromeState()

  var body: some View {
    NativiteViewControllerRepresentable(chromeState: chromeState)
      .ignoresSafeArea()
      .nativiteSheets(chromeState: chromeState)
      .nativiteAlerts(chromeState: chromeState)
  }
}
#endif

// ─── NativiteViewControllerRepresentable ─────────────────────────────────────
// Platform-specific Representable that wraps the imperative ViewController and
// injects chromeState so the ViewController can forward state to it.

#if os(iOS)
struct NativiteViewControllerRepresentable: UIViewControllerRepresentable {
  let chromeState: NativiteChromeState

  func makeUIViewController(context: Context) -> ViewController {
    let vc = ViewController()
    vc.chromeState = chromeState
    return vc
  }

  func updateUIViewController(_ vc: ViewController, context: Context) {
    // Hybrid: set prompt (subtitle) via UIKit since SwiftUI has no
    // .navigationSubtitle() on iOS. This works because NavigationStack
    // creates a UINavigationController internally.
    vc.navigationItem.prompt = chromeState.titleBarSubtitle
  }
}

#elseif os(macOS)
struct NativiteViewControllerRepresentable: NSViewControllerRepresentable {
  let chromeState: NativiteChromeState

  func makeNSViewController(context: Context) -> ViewController {
    let vc = ViewController()
    vc.chromeState = chromeState
    return vc
  }

  func updateNSViewController(_ nsViewController: ViewController, context: Context) {}
}

// macOS delegate adaptor — promotes the process from background agent to
// regular GUI app (Dock icon, key windows) when spawned directly, and
// terminates when the last window closes.
class NativiteAppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }
}
#endif
`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleaned = hex.trim();
  if (cleaned.startsWith("#")) cleaned = cleaned.slice(1);
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const value = parseInt(cleaned.slice(0, 6), 16);
  if (Number.isNaN(value)) return { r: 1, g: 1, b: 1 };
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

function swiftUIColorFromHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `Color(red: ${r.toFixed(4)}, green: ${g.toFixed(4)}, blue: ${b.toFixed(4)})`;
}
