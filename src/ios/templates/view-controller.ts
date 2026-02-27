import type { NativiteConfig } from "../../index.ts";

export function viewControllerTemplate(config: NativiteConfig): string {
  const hasOta = Boolean(config.updates);
  const hasDefaultChrome = Boolean(config.defaultChrome);

  // ── Shared helpers ──────────────────────────────────────────────────────────
  // These methods are identical on both platforms and compiled into both targets.

  const loadContentMethod = `
  private func loadContent() {
    #if DEBUG
    if let devURL = resolveDevURL() {
      webView.load(URLRequest(url: devURL))
      return
    }
    #endif

    assertEmbeddedBundlePlatform()

    ${
      hasOta
        ? `// Check for an OTA-applied bundle first
    if let otaIndex = otaUpdater.activeBundleIndexURL() {
      webView.loadFileURL(otaIndex, allowingReadAccessTo: otaIndex.deletingLastPathComponent())
      return
    }

    `
        : ""
    }// Fall back to the embedded dist/ bundle
    if let bundleIndex = Bundle.main.url(
      forResource: "index",
      withExtension: "html",
      subdirectory: "dist"
    ) {
      webView.loadFileURL(bundleIndex, allowingReadAccessTo: bundleIndex.deletingLastPathComponent())
    }
  }`;

  const assertEmbeddedBundlePlatformMethod = `
  private func assertEmbeddedBundlePlatform() {
    guard let manifestURL = Bundle.main.url(
      forResource: "manifest",
      withExtension: "json",
      subdirectory: "dist"
    ) else {
      fatalError("[Nativite] Missing embedded dist/manifest.json. Build the web bundle first.")
    }

    guard
      let data = try? Data(contentsOf: manifestURL),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let bundlePlatform = json["platform"] as? String
    else {
      fatalError("[Nativite] Invalid embedded dist/manifest.json. Rebuild the web bundle.")
    }

    #if os(iOS)
    let expectedPlatform = "ios"
    #elseif os(macOS)
    let expectedPlatform = "macos"
    #else
    let expectedPlatform = "unknown"
    #endif

    guard bundlePlatform == expectedPlatform else {
      fatalError(
        "[Nativite] Embedded web bundle platform mismatch: " +
          "expected \\(expectedPlatform), got \\(bundlePlatform)."
      )
    }
  }`;

  const resolveDevURLMethod = `
  #if DEBUG
  private func resolveDevURL() -> URL? {
    if let envValue = ProcessInfo.processInfo.environment["NATIVITE_DEV_URL"],
       let url = URL(string: envValue) {
      return url
    }
    return nil
  }
  #endif`;

  const sendToWebViewMethod = `
  // Called by NativiteBridge to send a message back to the WebView
  func sendToWebView(_ message: [String: Any]) {
    guard
      let data = try? JSONSerialization.data(withJSONObject: message),
      let json = String(data: data, encoding: .utf8)
    else { return }

    let js = "window.nativiteReceive(\\(json))"
    DispatchQueue.main.async {
      self.webView.evaluateJavaScript(js, completionHandler: nil)
    }
  }`;

  // ── iOS ViewController ────────────────────────────────────────────────────

  const iosViewController = `#if os(iOS)
import UIKit
import WebKit

class ViewController: UIViewController {

  private(set) var webView: NativiteWebView!
  private let bridge   = NativiteBridge()
  private let vars     = NativiteVars()
  private let keyboard = NativiteKeyboard()${hasOta ? "\n  private let otaUpdater = OTAUpdater()" : ""}

  // Chrome-controllable properties — set by NativiteChrome and read by UIKit overrides
  var statusBarStyle: UIStatusBarStyle = .default
  var statusBarHidden: Bool = false
  var homeIndicatorHidden: Bool = false

  override var preferredStatusBarStyle: UIStatusBarStyle { statusBarStyle }
  override var prefersStatusBarHidden: Bool { statusBarHidden }
  override var prefersHomeIndicatorAutoHidden: Bool { homeIndicatorHidden }

  override func viewDidLoad() {
    super.viewDidLoad()

    let config = WKWebViewConfiguration()
    // Appended to every request's User-Agent so the Vite dev server can route
    // this WKWebView to the correct named platform environment. iPad is
    // detected at runtime so a single binary serves both form factors.
    let nkPlatform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
    config.applicationNameForUserAgent = "Nativite/\\(nkPlatform)/1.0"
    // addScriptMessageHandler(_:contentWorld:name:) registers the bridge as a
    // WKScriptMessageHandlerWithReply, enabling the direct async reply channel
    // (postMessageWithReply on the JS side) without evaluateJavaScript roundtrips.
    config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "nativite")
    bridge.viewController = self

    // Install --nk-* CSS variable defaults before any content renders.
    vars.installUserScript(into: config)

    webView = NativiteWebView(frame: view.bounds, configuration: config)
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    // Disable automatic content inset adjustment — NativiteVars owns keyboard layout.
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    // Disable root-level document scrolling so the WebView does not slide up
    // when the keyboard appears. Inner elements with overflow:scroll/auto still
    // scroll via their own nested UIScrollViews inside WKWebView.
    webView.scrollView.isScrollEnabled = false
    // Re-push CSS variables after each navigation so the real device values
    // replace the zero defaults that the user script seeds at documentStart.
    webView.navigationDelegate = self
    view.addSubview(webView)

    vars.webView = webView
    vars.observeSystemEvents()

    // Wire vars into chrome so it can push geometry updates.
    bridge.chrome.vars = vars
    bridge.chrome.viewController = self

    // Wire the keyboard accessory handler.
    keyboard.viewController = self
    keyboard.vars = vars
    bridge.chrome.keyboard = keyboard
    keyboard.install(on: webView)

    ${hasOta ? "otaUpdater.applyPendingUpdateIfAvailable()\n    " : ""}loadContent()${hasOta ? "\n    Task { await otaUpdater.checkForUpdate() }" : ""}${hasDefaultChrome ? "\n    bridge.chrome.applyInitialState()" : ""}
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    // Push safe area + orientation + chrome geometry to CSS variables.
    vars.updateSafeArea(view.safeAreaInsets, in: self)
    // Also dispatch the bridge event so JS listeners still work.
    let insets = view.safeAreaInsets
    bridge.chrome.sendEvent(name: "safeArea.changed", data: [
      "top": insets.top,
      "left": insets.left,
      "bottom": insets.bottom,
      "right": insets.right,
    ])
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    vars.updateTraits(traitCollection)
  }
${loadContentMethod}
${assertEmbeddedBundlePlatformMethod}
${resolveDevURLMethod}
${sendToWebViewMethod}
}

// ─── UISearchResultsUpdating + UISearchBarDelegate ───────────────────────────
// Required conformances for NativiteChrome's search bar support.

extension ViewController: WKNavigationDelegate {
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // The user script seeds :root with zero defaults at documentStart.
    // Re-push the real device values now that the JS context exists so
    // all --nk-* variables reflect actual safe area, traits, etc.
    vars.updateSafeArea(view.safeAreaInsets, in: self)
    vars.updateTraits(traitCollection)
  }
}

extension ViewController: UISearchResultsUpdating, UISearchBarDelegate {
  func updateSearchResults(for searchController: UISearchController) {
    let text = searchController.searchBar.text ?? ""
    bridge.chrome.sendEvent(name: "searchBar.textChanged", data: ["text": text])
  }

  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    bridge.chrome.sendEvent(name: "searchBar.submitted", data: ["text": searchBar.text ?? ""])
  }

  func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
    bridge.chrome.sendEvent(name: "searchBar.cancelled", data: [:])
  }
}`;

  // ── macOS ViewController ──────────────────────────────────────────────────

  const macosViewController = `#elseif os(macOS)
import Cocoa
import WebKit

class ViewController: NSViewController {

  private(set) var webView: WKWebView!
  private let bridge = NativiteBridge()
  private let vars   = NativiteVars()${hasOta ? "\n  private let otaUpdater = OTAUpdater()" : ""}

  override func loadView() {
    view = NSView(frame: NSRect(x: 0, y: 0, width: 1024, height: 768))
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    let config = WKWebViewConfiguration()
    // Appended to every request's User-Agent so the Vite dev server can route
    // this WKWebView to the "macos" named platform environment.
    config.applicationNameForUserAgent = "Nativite/macos/1.0"
    config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "nativite")
    bridge.viewController = self

    vars.installUserScript(into: config)

    webView = WKWebView(frame: view.bounds, configuration: config)
    webView.autoresizingMask = [.width, .height]
    view.addSubview(webView)

    vars.webView = webView
    vars.observeSystemEvents()

    bridge.chrome.vars = vars
    bridge.chrome.viewController = self

    ${hasOta ? "otaUpdater.applyPendingUpdateIfAvailable()\n    " : ""}loadContent()${hasOta ? "\n    Task { await otaUpdater.checkForUpdate() }" : ""}${hasDefaultChrome ? "\n    bridge.chrome.applyInitialState()" : ""}
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    vars.updateSafeArea(view.safeAreaInsets)

    let insets = view.safeAreaInsets
    bridge.chrome.sendEvent(name: "safeArea.changed", data: [
      "top": insets.top,
      "left": insets.left,
      "bottom": insets.bottom,
      "right": insets.right,
    ])
  }
${loadContentMethod}
${assertEmbeddedBundlePlatformMethod}
${resolveDevURLMethod}
${sendToWebViewMethod}
}`;

  return `${iosViewController}

${macosViewController}
#endif
`;
}
