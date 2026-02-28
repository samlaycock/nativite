import type { NativiteConfig } from "../../index.ts";

export function viewControllerTemplate(config: NativiteConfig): string {
  const hasOta = Boolean(config.updates);
  const hasDefaultChrome = Boolean(config.defaultChrome);
  const splashBackgroundColor = config.splash?.backgroundColor
    ? swiftUIColorFromHex(config.splash.backgroundColor)
    : "UIColor.systemBackground";
  const splashImageOverlay = config.splash?.image
    ? `
    if let splashImage = UIImage(named: "Splash") {
      let splashImageView = UIImageView(image: splashImage)
      splashImageView.translatesAutoresizingMaskIntoConstraints = false
      splashImageView.contentMode = .center
      splashView.addSubview(splashImageView)

      NSLayoutConstraint.activate([
        splashImageView.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
        splashImageView.centerYAnchor.constraint(equalTo: splashView.centerYAnchor),
        splashImageView.widthAnchor.constraint(lessThanOrEqualTo: splashView.widthAnchor, multiplier: 0.8),
        splashImageView.heightAnchor.constraint(lessThanOrEqualTo: splashView.heightAnchor, multiplier: 0.8),
      ])
    }
`
    : "";
  const splashDefaultActivityIndicator = config.splash
    ? ""
    : `
    let activityIndicator = UIActivityIndicatorView(style: .large)
    activityIndicator.translatesAutoresizingMaskIntoConstraints = false
    activityIndicator.color = .secondaryLabel
    activityIndicator.startAnimating()
    splashView.addSubview(activityIndicator)

    NSLayoutConstraint.activate([
      activityIndicator.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
      activityIndicator.centerYAnchor.constraint(equalTo: splashView.centerYAnchor),
    ])
`;

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
      print("[Nativite] Warning: Missing embedded dist/manifest.json. Build the web bundle first.")
      return
    }

    guard
      let data = try? Data(contentsOf: manifestURL),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let bundlePlatform = json["platform"] as? String
    else {
      print("[Nativite] Warning: Invalid embedded dist/manifest.json. Rebuild the web bundle.")
      return
    }

    #if os(iOS)
    let compatiblePlatforms: Set<String> = ["ios", "ipad"]
    let expectedPlatformDescription = "ios or ipad"
    #elseif os(macOS)
    let compatiblePlatforms: Set<String> = ["macos"]
    let expectedPlatformDescription = "macos"
    #else
    let compatiblePlatforms: Set<String> = ["unknown"]
    let expectedPlatformDescription = "unknown"
    #endif

    guard compatiblePlatforms.contains(bundlePlatform) else {
      print(
        "[Nativite] Embedded web bundle platform mismatch: " +
          "expected \\(expectedPlatformDescription), got \\(bundlePlatform)."
      )
      return
    }
  }`;

  const resolveDevURLMethod = `
  #if DEBUG
  private func resolveDevURL() -> URL? {
    let devURLDefaultsKey = "nativite.dev.url"

    if let envValue = ProcessInfo.processInfo.environment["NATIVITE_DEV_URL"],
       let url = URL(string: envValue) {
      UserDefaults.standard.set(envValue, forKey: devURLDefaultsKey)
      return url
    }

    if let persistedValue = UserDefaults.standard.string(forKey: devURLDefaultsKey),
       let url = URL(string: persistedValue) {
      return url
    }

    if
      let configURL = Bundle.main.url(forResource: "dev", withExtension: "json"),
      let data = try? Data(contentsOf: configURL),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    {
      if let rawURL = json["devURL"] as? String, let url = URL(string: rawURL) {
        UserDefaults.standard.set(rawURL, forKey: devURLDefaultsKey)
        return url
      }
      if let rawURL = json["devUrl"] as? String, let url = URL(string: rawURL) {
        UserDefaults.standard.set(rawURL, forKey: devURLDefaultsKey)
        return url
      }
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
  private var splashOverlayView: UIView?
  private var splashOverlayHidden = false

  // Chrome-controllable properties — set by NativiteChrome and read by UIKit overrides
  var statusBarStyle: UIStatusBarStyle = .default
  var statusBarHidden: Bool = false
  var homeIndicatorHidden: Bool = false

  override var preferredStatusBarStyle: UIStatusBarStyle { statusBarStyle }
  override var prefersStatusBarHidden: Bool { statusBarHidden }
  override var prefersHomeIndicatorAutoHidden: Bool { homeIndicatorHidden }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let config = WKWebViewConfiguration()
    // Using WKWebsiteDataStore.default() ensures this webview shares the same
    // web process as any other webview using the default store (iOS 15+),
    // enabling shared storage (localStorage, IndexedDB, cookies) across instances.
    config.websiteDataStore = WKWebsiteDataStore.default()
    // Appended to every request's User-Agent so the Vite dev server can route
    // this WKWebView to the correct named platform environment. iPad is
    // detected at runtime so a single binary serves both form factors.
    let nkPlatform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
    config.applicationNameForUserAgent = "Nativite/\\(nkPlatform)/1.0"
    // Identify this webview as "main" so the native message broker can
    // route postToParent/postToChild/broadcast calls to the correct instance.
    config.userContentController.addUserScript(WKUserScript(
      source: "window.__nativekit_instance_name__ = \\"main\\";",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
    // addScriptMessageHandler(_:contentWorld:name:) registers the bridge as a
    // WKScriptMessageHandlerWithReply, enabling the direct async reply channel
    // (postMessageWithReply on the JS side) without evaluateJavaScript roundtrips.
    config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "nativite")
    bridge.viewController = self

    // Install --nk-* CSS variable defaults before any content renders.
    vars.installUserScript(into: config)

    webView = NativiteWebView(frame: view.bounds, configuration: config)
    #if DEBUG
    if #available(iOS 16.4, *) {
      webView.isInspectable = true
    }
    #endif
    // Let the host view's dynamic systemBackground color show through while
    // content is loading so dark mode starts dark instead of white.
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    bridge.primaryWebView = webView
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
    webView.uiDelegate = self
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

    // Use the modern trait change registration API (iOS 17+) instead of the
    // deprecated traitCollectionDidChange override.
    registerForTraitChanges(
      [UITraitUserInterfaceStyle.self, UITraitPreferredContentSizeCategory.self, UITraitAccessibilityContrast.self]
    ) { (vc: ViewController, _: UITraitCollection) in
      vc.vars.updateTraits(vc.traitCollection)
    }

    ${hasOta ? "otaUpdater.applyPendingUpdateIfAvailable()\n    " : ""}showSplashOverlay()
    loadContent()${hasOta ? "\n    Task { await otaUpdater.checkForUpdate() }" : ""}${hasDefaultChrome ? "\n    bridge.chrome.applyInitialState()" : ""}
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

  private func showSplashOverlay() {
    guard splashOverlayView == nil else { return }

    let splashView = UIView(frame: view.bounds)
    splashView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    splashView.backgroundColor = ${splashBackgroundColor}
${splashImageOverlay}${splashDefaultActivityIndicator}    view.addSubview(splashView)
    view.bringSubviewToFront(splashView)
    splashOverlayView = splashView
  }

  private func hideSplashOverlay() {
    guard !splashOverlayHidden else { return }
    splashOverlayHidden = true

    guard let splashView = splashOverlayView else { return }
    UIView.animate(
      withDuration: 0.2,
      animations: {
        splashView.alpha = 0
      },
      completion: { _ in
        splashView.removeFromSuperview()
      }
    )
  }

  private func isExternalURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https"
    else { return false }

    guard let currentURL = webView.url,
          let currentScheme = currentURL.scheme?.lowercased()
    else { return true }

    if currentScheme == "file" {
      return true
    }
    guard currentScheme == "http" || currentScheme == "https" else { return true }

    let currentHost = currentURL.host?.lowercased()
    let targetHost = url.host?.lowercased()
    return !(currentScheme == scheme && currentHost == targetHost && currentURL.port == url.port)
  }

  @discardableResult
  private func openExternalURL(_ url: URL) -> Bool {
    guard isExternalURL(url) else { return false }
    UIApplication.shared.open(url, options: [:], completionHandler: nil)
    return true
  }
${loadContentMethod}
${assertEmbeddedBundlePlatformMethod}
${resolveDevURLMethod}
${sendToWebViewMethod}

  // Expose the bridge handler so sibling native controllers (e.g. sheet-hosted
  // webviews) can register the same native JS bridge channel.
  func nativiteBridgeHandler() -> NativiteBridge {
    bridge
  }

}

// ─── UISearchResultsUpdating + UISearchBarDelegate ───────────────────────────
// Required conformances for NativiteChrome's search bar support.

extension ViewController: WKNavigationDelegate {
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }

    if navigationAction.navigationType == .linkActivated && openExternalURL(url) {
      decisionHandler(.cancel)
      return
    }

    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // The user script seeds :root with zero defaults at documentStart.
    // Re-push the real device values now that the JS context exists so
    // all --nk-* variables reflect actual safe area, traits, etc.
    vars.updateSafeArea(view.safeAreaInsets, in: self)
    vars.updateTraits(traitCollection)
    hideSplashOverlay()
  }
}

extension ViewController: WKUIDelegate {
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    guard
      navigationAction.targetFrame == nil,
      let url = navigationAction.request.url
    else { return nil }

    if openExternalURL(url) {
      return nil
    }

    webView.load(URLRequest(url: url))
    return nil
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
      completionHandler()
    })
    present(alert, animated: true, completion: nil)
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (Bool) -> Void
  ) {
    let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
      completionHandler(false)
    })
    alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
      completionHandler(true)
    })
    present(alert, animated: true, completion: nil)
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptTextInputPanelWithPrompt prompt: String,
    defaultText: String?,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (String?) -> Void
  ) {
    let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
    alert.addTextField { textField in
      textField.text = defaultText
    }
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
      completionHandler(nil)
    })
    alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
      completionHandler(alert.textFields?.first?.text)
    })
    present(alert, animated: true, completion: nil)
  }
}

extension ViewController: UISearchResultsUpdating, UISearchBarDelegate {
  func updateSearchResults(for searchController: UISearchController) {
    let value = searchController.searchBar.text ?? ""
    bridge.chrome.sendEvent(name: "titleBar.searchChanged", data: ["value": value])
  }

  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    bridge.chrome.sendEvent(name: "titleBar.searchSubmitted", data: ["value": searchBar.text ?? ""])
  }

  func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
    bridge.chrome.sendEvent(name: "titleBar.searchCancelled", data: [:])
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
    #if DEBUG
    if #available(macOS 13.3, *) {
      webView.isInspectable = true
    }
    #endif
    bridge.primaryWebView = webView
    webView.autoresizingMask = [.width, .height]
    webView.navigationDelegate = self
    webView.uiDelegate = self
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

  private func isExternalURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https"
    else { return false }

    guard let currentURL = webView.url,
          let currentScheme = currentURL.scheme?.lowercased()
    else { return true }

    if currentScheme == "file" {
      return true
    }
    guard currentScheme == "http" || currentScheme == "https" else { return true }

    let currentHost = currentURL.host?.lowercased()
    let targetHost = url.host?.lowercased()
    return !(currentScheme == scheme && currentHost == targetHost && currentURL.port == url.port)
  }

  @discardableResult
  private func openExternalURL(_ url: URL) -> Bool {
    guard isExternalURL(url) else { return false }
    NSWorkspace.shared.open(url)
    return true
  }
${loadContentMethod}
${assertEmbeddedBundlePlatformMethod}
${resolveDevURLMethod}
${sendToWebViewMethod}
}

extension ViewController: WKNavigationDelegate {
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }

    if navigationAction.navigationType == .linkActivated && openExternalURL(url) {
      decisionHandler(.cancel)
      return
    }

    decisionHandler(.allow)
  }
}

extension ViewController: WKUIDelegate {
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    guard
      navigationAction.targetFrame == nil,
      let url = navigationAction.request.url
    else { return nil }

    if openExternalURL(url) {
      return nil
    }

    webView.load(URLRequest(url: url))
    return nil
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    let alert = NSAlert()
    alert.alertStyle = .informational
    alert.messageText = message
    alert.addButton(withTitle: "OK")

    if let window = view.window {
      alert.beginSheetModal(for: window) { _ in
        completionHandler()
      }
      return
    }

    _ = alert.runModal()
    completionHandler()
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (Bool) -> Void
  ) {
    let alert = NSAlert()
    alert.alertStyle = .informational
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")

    if let window = view.window {
      alert.beginSheetModal(for: window) { response in
        completionHandler(response == .alertFirstButtonReturn)
      }
      return
    }

    let response = alert.runModal()
    completionHandler(response == .alertFirstButtonReturn)
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptTextInputPanelWithPrompt prompt: String,
    defaultText: String?,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (String?) -> Void
  ) {
    let textField = NSTextField(string: defaultText ?? "")
    textField.frame = NSRect(x: 0, y: 0, width: 280, height: 24)

    let alert = NSAlert()
    alert.alertStyle = .informational
    alert.messageText = prompt
    alert.accessoryView = textField
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")

    if let window = view.window {
      alert.beginSheetModal(for: window) { response in
        completionHandler(response == .alertFirstButtonReturn ? textField.stringValue : nil)
      }
      return
    }

    let response = alert.runModal()
    completionHandler(response == .alertFirstButtonReturn ? textField.stringValue : nil)
  }
}`;

  return `${iosViewController}

${macosViewController}
#endif
`;
}

function swiftUIColorFromHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `UIColor(red: ${r.toFixed(4)}, green: ${g.toFixed(4)}, blue: ${b.toFixed(4)}, alpha: 1)`;
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
