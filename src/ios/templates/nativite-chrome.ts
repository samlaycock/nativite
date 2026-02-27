import type { NativiteConfig } from "../../index.ts";

// NOTE: NativiteChrome holds a weak reference to NativiteKeyboard so it can
// forward keyboard state from applyState(). The keyboard instance is created in
// ViewController and injected via the `keyboard` property.

export function nativiteChromeTemplate(config: NativiteConfig): string {
  // Embed defaultChrome as a JSON string literal if provided.
  // applyInitialState() is only emitted when the config contains defaultChrome.
  const defaultChromeJson = config.defaultChrome ? JSON.stringify(config.defaultChrome) : null;

  const applyInitialStateMethod = defaultChromeJson
    ? `
  // ── Default Chrome ──────────────────────────────────────────────────────────
  // Called from ViewController.viewDidLoad() when a defaultChrome was set in
  // nativite.config.ts. Applies the initial chrome state before the WebView
  // has loaded so the native UI is correct from the very first frame.

  func applyInitialState() {
    let jsonString = ${JSON.stringify(defaultChromeJson)}
    guard
      let data = jsonString.data(using: .utf8),
      let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return }
    applyState(state)
  }
`
    : "";

  // ── Shared sendEvent ──────────────────────────────────────────────────────
  const sendEventMethod = `
  // ── Event helper ───────────────────────────────────────────────────────────

  func sendEvent(name: String, data: [String: Any]) {
    viewController?.sendToWebView([
      "id": NSNull(),
      "type": "event",
      "event": name,
      "data": data,
    ])
  }`;

  // ── iOS implementation ──────────────────────────────────────────────────────

  const iosChrome = `#if os(iOS)
import UIKit
import WebKit

// NativiteChrome reconciles declarative chrome state from JS onto UIKit.
// Registered as a bridge handler under "__chrome_set_state__".
private let nativiteSmallDetentIdentifier = UISheetPresentationController.Detent.Identifier("nativite.small")

class NativiteChrome: NSObject {

  weak var viewController: ViewController?
  // NativiteVars receives geometry updates after each setState call so it can
  // keep --nk-nav-height, --nk-tab-height etc. in sync with the live UIKit state.
  weak var vars: NativiteVars?
  // NativiteKeyboard handles the input accessory bar and keyboard dismiss mode.
  weak var keyboard: NativiteKeyboard?
  // Self-managed tab bar — not backed by a UITabBarController. Installed lazily
  // into vc.view on the first applyTabBar(_:) call.
  private lazy var tabBar = UITabBar()

  // ── Entry point ────────────────────────────────────────────────────────────

  func applyState(_ args: Any?) {
    guard let state = args as? [String: Any] else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      if let navBar = state["navigationBar"] as? [String: Any] {
        self.applyNavigationBar(navBar)
      }
      if let tabBar = state["tabBar"] as? [String: Any] {
        self.applyTabBar(tabBar)
      }
      if let toolbar = state["toolbar"] as? [String: Any] {
        self.applyToolbar(toolbar)
      }
      if let statusBar = state["statusBar"] as? [String: Any] {
        self.applyStatusBar(statusBar)
      }
      if let homeIndicator = state["homeIndicator"] as? [String: Any] {
        self.applyHomeIndicator(homeIndicator)
      }
      if let searchBar = state["searchBar"] as? [String: Any] {
        self.applySearchBar(searchBar)
      }
      if let sheet = state["sheet"] as? [String: Any] {
        self.applySheet(sheet)
      }
      // keyboard key — forward to NativiteKeyboard when the key is present.
      // We pass the dict directly; NativiteKeyboard handles missing/null sub-keys.
      if let keyboardState = state["keyboard"] as? [String: Any] {
        self.keyboard?.applyState(keyboardState)
      }

      // Push updated chrome geometry to CSS variables after all state is applied.
      self.pushVarUpdates()
    }
  }

  // Read live UIKit geometry and forward to NativiteVars.
  // Called from the main-thread DispatchQueue block in applyState(_:).
  private func pushVarUpdates() {
    guard let vc = viewController else { return }
    let navController  = vc.navigationController

    let navH  = navController.map  { $0.navigationBar.frame.height } ?? 0
    let navV  = navController.map  { !$0.isNavigationBarHidden       } ?? false
    let tabH  = tabBar.superview != nil ? tabBar.frame.height : 0
    let tabV  = tabBar.superview != nil && !tabBar.isHidden
    let toolH = navController.map  { $0.toolbar.frame.height          } ?? 0
    let toolV = navController.map  { !$0.isToolbarHidden              } ?? false

    vars?.updateChrome(
      navHeight:      navH,  navVisible:      navV,
      tabHeight:      tabH,  tabVisible:      tabV,
      toolbarHeight:  toolH, toolbarVisible:  toolV
    )
  }
${applyInitialStateMethod}
  // ── Navigation Bar ─────────────────────────────────────────────────────────

  private func applyNavigationBar(_ state: [String: Any]) {
    guard let vc = viewController,
          let navController = vc.navigationController else { return }

    let navItem = vc.navigationItem
    let navBar = navController.navigationBar

    if let title = state["title"] as? String {
      navItem.title = title
    }
    if let mode = state["largeTitleMode"] as? String {
      navItem.largeTitleDisplayMode = largeTitleDisplayMode(from: mode)
    }
    if let backTitle = state["backButtonTitle"] as? String {
      navItem.backButtonTitle = backTitle
    } else if state["backButtonTitle"] is NSNull {
      navItem.backButtonTitle = ""
    }
    if let hex = state["tintColor"] as? String {
      navBar.tintColor = UIColor(hex: hex)
    }
    if let hex = state["barTintColor"] as? String {
      let appearance = UINavigationBarAppearance()
      appearance.configureWithOpaqueBackground()
      appearance.backgroundColor = UIColor(hex: hex)
      navBar.standardAppearance = appearance
      navBar.scrollEdgeAppearance = appearance
    }
    if let translucent = state["translucent"] as? Bool {
      navBar.isTranslucent = translucent
    }
    navController.setNavigationBarHidden((state["hidden"] as? Bool) ?? false, animated: true)
    if let leftItems = state["toolbarLeft"] as? [[String: Any]] {
      navItem.leftBarButtonItems = leftItems.compactMap { toolbarItem($0, position: "left") }
    }
    if let rightItems = state["toolbarRight"] as? [[String: Any]] {
      navItem.rightBarButtonItems = rightItems.compactMap { toolbarItem($0, position: "right") }
    }
  }

  private func largeTitleDisplayMode(from string: String) -> UINavigationItem.LargeTitleDisplayMode {
    switch string {
    case "always": return .always
    case "never": return .never
    default: return .automatic
    }
  }

  private func barButtonItem(_ state: [String: Any], position: String) -> UIBarButtonItem? {
    guard let id = state["id"] as? String else { return nil }

    let style: UIBarButtonItem.Style
    switch state["style"] as? String {
    case "done": style = .done
    default: style = .plain
    }

    let menu: UIMenu?
    if #available(iOS 14.0, *) {
      if let menuState = state["menu"] as? [String: Any] {
        menu = barButtonMenu(menuState, position: position)
      } else if let menuItems = state["menu"] as? [[String: Any]] {
        menu = barButtonMenu(["items": menuItems], position: position)
      } else {
        menu = nil
      }
    } else {
      menu = nil
    }

    let item: UIBarButtonItem
    if let symbolName = state["systemImage"] as? String,
       let image = UIImage(systemName: symbolName) {
      if #available(iOS 14.0, *), let menu {
        item = UIBarButtonItem(title: nil, image: image, primaryAction: nil, menu: menu)
      } else {
        item = UIBarButtonItem(image: image, style: style, target: self, action: #selector(barButtonTapped(_:)))
      }
    } else if let title = state["title"] as? String {
      if #available(iOS 14.0, *), let menu {
        item = UIBarButtonItem(title: title, image: nil, primaryAction: nil, menu: menu)
      } else {
        item = UIBarButtonItem(title: title, style: style, target: self, action: #selector(barButtonTapped(_:)))
      }
    } else {
      return nil
    }

    item.style = style
    item.accessibilityIdentifier = "\\(position):\\(id)"
    item.isEnabled = !((state["disabled"] as? Bool) ?? false)
    return item
  }

  @available(iOS 14.0, *)
  private func barButtonMenu(_ state: [String: Any], position: String) -> UIMenu? {
    let menuTitle = state["title"] as? String ?? ""
    guard let itemStates = state["items"] as? [[String: Any]] else { return nil }
    let children = itemStates.compactMap { barButtonMenuElement($0, position: position) }
    guard !children.isEmpty else { return nil }
    return UIMenu(title: menuTitle, children: children)
  }

  @available(iOS 14.0, *)
  private func barButtonMenuElement(_ itemState: [String: Any], position: String) -> UIMenuElement? {
    if itemState["separator"] as? Bool == true {
      return UIMenuElement.separator()
    }

    if let submenuStates = itemState["submenu"] as? [[String: Any]] {
      let menuTitle = itemState["title"] as? String ?? ""
      let menuImage = (itemState["systemImage"] as? String).flatMap { UIImage(systemName: $0) }
      let children = submenuStates.compactMap { barButtonMenuElement($0, position: position) }
      guard !children.isEmpty else { return nil }
      return UIMenu(title: menuTitle, image: menuImage, identifier: nil, options: [], children: children)
    }

    guard let id = itemState["id"] as? String,
          let title = itemState["title"] as? String else { return nil }

    let image = (itemState["systemImage"] as? String).flatMap { UIImage(systemName: $0) }
    var attributes = UIMenuElement.Attributes()
    if (itemState["disabled"] as? Bool) ?? false {
      attributes.insert(.disabled)
    }
    if (itemState["style"] as? String) == "destructive" {
      attributes.insert(.destructive)
    }
    let actionState: UIMenuElement.State = ((itemState["checked"] as? Bool) ?? false) ? .on : .off
    let eventName = position == "toolbar" ? "toolbar.buttonTapped" : "navigationBar.buttonTapped"

    return UIAction(
      title: title,
      image: image,
      identifier: nil,
      discoverabilityTitle: nil,
      attributes: attributes,
      state: actionState
    ) { [weak self] _ in
      self?.sendEvent(name: eventName, data: ["id": id])
    }
  }

  @objc private func barButtonTapped(_ sender: UIBarButtonItem) {
    guard let identifier = sender.accessibilityIdentifier else { return }
    let parts = identifier.split(separator: ":").map(String.init)
    guard parts.count == 2 else { return }
    let id = parts[1]
    if parts[0] == "toolbar" {
      sendEvent(name: "toolbar.buttonTapped", data: ["id": id])
    } else {
      sendEvent(name: "navigationBar.buttonTapped", data: ["id": id])
    }
  }

  // ── Tab Bar ────────────────────────────────────────────────────────────────

  private func applyTabBar(_ state: [String: Any]) {
    guard let vc = viewController else { return }

    // Lazily install the owned tab bar into vc.view on first use.
    if tabBar.superview == nil {
      tabBar.delegate = self
      tabBar.translatesAutoresizingMaskIntoConstraints = false
      vc.view.addSubview(tabBar)
      NSLayoutConstraint.activate([
        tabBar.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor),
        tabBar.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor),
        tabBar.bottomAnchor.constraint(equalTo: vc.view.bottomAnchor),
      ])
    }

    if let items = state["items"] as? [[String: Any]] {
      tabBar.items = items.enumerated().compactMap { (index, itemState) -> UITabBarItem? in
        guard let title = itemState["title"] as? String else { return nil }
        let image = (itemState["systemImage"] as? String).flatMap { UIImage(systemName: $0) }
        let item = UITabBarItem(title: title, image: image, tag: index)
        item.accessibilityIdentifier = itemState["id"] as? String
        if let badge = itemState["badge"] as? String {
          item.badgeValue = badge
        } else if itemState["badge"] is NSNull {
          item.badgeValue = nil
        }
        if let hex = itemState["badgeColor"] as? String {
          item.badgeColor = UIColor(hex: hex)
        }
        return item
      }
    }

    if let selectedId = state["selectedTabId"] as? String,
       let item = tabBar.items?.first(where: { $0.accessibilityIdentifier == selectedId }) {
      tabBar.selectedItem = item
    }
    if let hex = state["tintColor"] as? String {
      tabBar.tintColor = UIColor(hex: hex)
    }
    if let hex = state["unselectedTintColor"] as? String {
      tabBar.unselectedItemTintColor = UIColor(hex: hex)
    }
    if let hex = state["barTintColor"] as? String {
      let appearance = UITabBarAppearance()
      appearance.configureWithOpaqueBackground()
      appearance.backgroundColor = UIColor(hex: hex)
      tabBar.standardAppearance = appearance
      tabBar.scrollEdgeAppearance = appearance
    }
    if let translucent = state["translucent"] as? Bool {
      tabBar.isTranslucent = translucent
    }
    if let hidden = state["hidden"] as? Bool {
      tabBar.isHidden = hidden
    }
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  private func applyToolbar(_ state: [String: Any]) {
    guard let vc = viewController,
          let navController = vc.navigationController else { return }

    navController.setToolbarHidden((state["hidden"] as? Bool) ?? false, animated: true)
    if let hex = state["barTintColor"] as? String {
      navController.toolbar.barTintColor = UIColor(hex: hex)
    }
    if let translucent = state["translucent"] as? Bool {
      navController.toolbar.isTranslucent = translucent
    }
    if let items = state["items"] as? [[String: Any]] {
      vc.toolbarItems = items.compactMap { toolbarItem($0) }
    }
  }

  private func toolbarItem(_ state: [String: Any], position: String = "toolbar") -> UIBarButtonItem? {
    switch state["type"] as? String {
    case "flexibleSpace":
      return UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
    case "fixedSpace":
      let item = UIBarButtonItem(barButtonSystemItem: .fixedSpace, target: nil, action: nil)
      item.width = state["width"] as? CGFloat ?? 8
      return item
    default:
      return barButtonItem(state, position: position)
    }
  }

  // ── Status Bar ─────────────────────────────────────────────────────────────

  private func applyStatusBar(_ state: [String: Any]) {
    guard let vc = viewController else { return }

    if let style = state["style"] as? String {
      vc.statusBarStyle = style == "light" ? .lightContent : .darkContent
    }
    if let hidden = state["hidden"] as? Bool {
      vc.statusBarHidden = hidden
    }
    vc.setNeedsStatusBarAppearanceUpdate()
  }

  // ── Home Indicator ─────────────────────────────────────────────────────────

  private func applyHomeIndicator(_ state: [String: Any]) {
    guard let vc = viewController else { return }

    if let hidden = state["hidden"] as? Bool {
      vc.homeIndicatorHidden = hidden
    }
    vc.setNeedsUpdateOfHomeIndicatorAutoHidden()
  }

  // ── Search Bar ────────────────────────────────────────────────────────────

  private func applySearchBar(_ state: [String: Any]) {
    guard let vc = viewController else { return }

    // Lazily create and attach a UISearchController to the navigation item
    if vc.navigationItem.searchController == nil {
      let searchController = UISearchController(searchResultsController: nil)
      searchController.searchResultsUpdater = vc
      searchController.searchBar.delegate = vc
      searchController.obscuresBackgroundDuringPresentation = false
      vc.navigationItem.searchController = searchController
      vc.navigationItem.hidesSearchBarWhenScrolling = true
    }

    let searchBar = vc.navigationItem.searchController!.searchBar

    if let placeholder = state["placeholder"] as? String {
      searchBar.placeholder = placeholder
    }
    if let text = state["text"] as? String {
      searchBar.text = text
    }
    if let hex = state["barTintColor"] as? String {
      searchBar.barTintColor = UIColor(hex: hex)
    }
    if let shows = state["showsCancelButton"] as? Bool {
      searchBar.showsCancelButton = shows
    }
  }

  // ── Sheet ──────────────────────────────────────────────────────────────────

  private func applySheet(_ state: [String: Any]) {
    guard let vc = viewController else { return }

    let presented = state["presented"] as? Bool ?? false

    if presented {
      let sheetVC: NativiteSheetViewController
      let shouldPresent: Bool

      if let existing = vc.presentedViewController as? NativiteSheetViewController {
        sheetVC = existing
        shouldPresent = false
      } else if vc.presentedViewController == nil {
        let created = NativiteSheetViewController()
        created.bridge = self
        sheetVC = created
        shouldPresent = true
      } else {
        return
      }

      if let sheet = sheetVC.sheetPresentationController {
        if let detentStrings = state["detents"] as? [String] {
          sheet.detents = detentStrings.compactMap { sheetDetent(from: $0) }
        } else if shouldPresent {
          sheet.detents = [.medium(), .large()]
        }
        if let selectedDetent = state["selectedDetent"] as? String {
          sheet.selectedDetentIdentifier = sheetDetentIdentifier(from: selectedDetent)
        }
        sheet.prefersGrabberVisible = state["grabberVisible"] as? Bool ?? false
        // Prioritise embedded webview interaction over "drag anywhere to resize".
        sheet.prefersScrollingExpandsWhenScrolledToEdge = false
        if let radiusNumber = state["cornerRadius"] as? NSNumber {
          sheet.preferredCornerRadius = CGFloat(truncating: radiusNumber)
        }
        sheet.delegate = sheetVC
      }
      sheetVC.nativeBridge = vc.nativiteBridgeHandler()
      if let hex = state["backgroundColor"] as? String {
        sheetVC.view.backgroundColor = UIColor(hex: hex)
      }
      if let rawURL = state["url"] as? String {
        sheetVC.loadURL(rawURL, relativeTo: vc.webView.url)
      }
      if shouldPresent {
        vc.present(sheetVC, animated: true)
      }
    } else {
      if vc.presentedViewController is NativiteSheetViewController {
        vc.dismiss(animated: true)
      }
    }
  }

  func postMessageToSheet(_ message: Any?) {
    guard let sheetVC = viewController?.presentedViewController as? NativiteSheetViewController else {
      return
    }
    sheetVC.postMessage(message)
  }

  private func sheetDetent(from string: String) -> UISheetPresentationController.Detent? {
    switch string {
    case "small": return smallDetent()
    case "medium": return .medium()
    case "large": return .large()
    default: return nil
    }
  }

  private func sheetDetentIdentifier(
    from string: String
  ) -> UISheetPresentationController.Detent.Identifier? {
    switch string {
    case "small": return smallDetentIdentifier()
    case "medium": return .medium
    case "large": return .large
    default: return nil
    }
  }

  private func smallDetent() -> UISheetPresentationController.Detent? {
    if #available(iOS 16.0, *) {
      return UISheetPresentationController.Detent.custom(identifier: nativiteSmallDetentIdentifier) { context in
        max(120, context.maximumDetentValue * 0.25)
      }
    }
    return .medium()
  }

  private func smallDetentIdentifier() -> UISheetPresentationController.Detent.Identifier? {
    if #available(iOS 16.0, *) {
      return nativiteSmallDetentIdentifier
    }
    return .medium
  }
${sendEventMethod}
}

// ─── UITabBarDelegate ─────────────────────────────────────────────────────────

extension NativiteChrome: UITabBarDelegate {
  func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
    guard let id = item.accessibilityIdentifier else { return }
    sendEvent(name: "tabBar.tabSelected", data: ["id": id])
  }
}

// ─── Supporting: NativiteSheetViewController ─────────────────────────────────

private class NativiteSheetViewController: UIViewController,
  UISheetPresentationControllerDelegate,
  WKScriptMessageHandler,
  WKNavigationDelegate
{
  weak var bridge: NativiteChrome?
  weak var nativeBridge: NativiteBridge?
  private(set) var webView: NativiteWebView!
  private var lastLoadedURL: URL?
  private var pendingSPARoute: String?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let config = WKWebViewConfiguration()
    let bridgeScript = """
      (function () {
        if (window.nativiteSheet) return;

        const listeners = new Set();
        window.nativiteSheet = {
          postMessage(message) {
            const payload = message ?? null;
            const sheetHandler = window.webkit?.messageHandlers?.nativiteSheet;
            if (sheetHandler && typeof sheetHandler.postMessage === "function") {
              sheetHandler.postMessage(payload);
              return;
            }
            const bridgeHandler = window.webkit?.messageHandlers?.nativite;
            if (bridgeHandler && typeof bridgeHandler.postMessage === "function") {
              bridgeHandler.postMessage({
                id: null,
                type: "call",
                namespace: "__chrome__",
                method: "__chrome_sheet_post_message_to_sheet__",
                args: payload,
              });
            }
          },
          onMessage(handler) {
            if (typeof handler !== "function") return () => {};
            listeners.add(handler);
            return () => listeners.delete(handler);
          }
        };

        window.__nativiteSheetReceive = function(message) {
          for (const listener of listeners) listener(message);
          window.dispatchEvent(new CustomEvent("nativite:sheet-message", { detail: message }));
        };
      })();
    """
    let userScript = WKUserScript(
      source: bridgeScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    )
    config.userContentController.addUserScript(userScript)
    config.userContentController.add(self, name: "nativiteSheet")
    if let nativeBridge {
      config.userContentController.addScriptMessageHandler(nativeBridge, contentWorld: .page, name: "nativite")
    }
    let nkPlatform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
    config.applicationNameForUserAgent = "Nativite/\\(nkPlatform)/1.0"

    webView = NativiteWebView(frame: view.bounds, configuration: config)
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    // Mirror the primary webview blank-state behavior: keep the underlying
    // dynamic system background visible while content bootstraps.
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    webView.lockRootScroll = false
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.isScrollEnabled = true
    webView.scrollView.bounces = false
    webView.scrollView.alwaysBounceVertical = false
    webView.scrollView.alwaysBounceHorizontal = false
    webView.navigationDelegate = self
    view.addSubview(webView)
  }

  deinit {
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "nativite")
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "nativiteSheet")
  }

  func loadURL(_ rawURL: String, relativeTo baseURL: URL?) {
    loadViewIfNeeded()
    guard let resolved = resolveURL(rawURL, relativeTo: baseURL) else { return }
    let absoluteURL = resolved.absoluteURL
    let nextSPARoute = pendingFileSPARoute(for: rawURL, resolvedURL: absoluteURL)
    if absoluteURL == lastLoadedURL {
      if let route = nextSPARoute {
        applySPARoute(route)
      }
      return
    }
    pendingSPARoute = nextSPARoute
    lastLoadedURL = absoluteURL

    if absoluteURL.isFileURL {
      let readAccessURL = fileReadAccessURL(for: absoluteURL, relativeTo: baseURL)
      webView.loadFileURL(
        absoluteURL,
        allowingReadAccessTo: readAccessURL
      )
      return
    }

    webView.load(URLRequest(url: absoluteURL))
  }

  func postMessage(_ message: Any?) {
    loadViewIfNeeded()
    let payload = message ?? NSNull()
    let envelope: [String: Any] = ["message": payload]
    guard JSONSerialization.isValidJSONObject(envelope),
      let data = try? JSONSerialization.data(withJSONObject: envelope),
      let json = String(data: data, encoding: .utf8)
    else { return }

    let js = "if(window.__nativiteSheetReceive){window.__nativiteSheetReceive(\\(json).message);}"
    webView.evaluateJavaScript(js, completionHandler: nil)
  }

  private func resolveURL(_ rawURL: String, relativeTo baseURL: URL?) -> URL? {
    if let absoluteURL = URL(string: rawURL), absoluteURL.scheme != nil {
      return absoluteURL
    }

    let effectiveBaseURL = baseURL ?? fallbackBaseURL()

    if rawURL.hasPrefix("/") {
      return resolveRootPath(rawURL, relativeTo: effectiveBaseURL)
    }

    if let effectiveBaseURL {
      return URL(string: rawURL, relativeTo: effectiveBaseURL)
    }
    return nil
  }

  private func resolveRootPath(_ rawPath: String, relativeTo baseURL: URL?) -> URL? {
    guard let baseURL else { return nil }

    let baseScheme = baseURL.scheme?.lowercased()
    if baseScheme == "file" {
      if let explicitFileURL = explicitFilePathURL(rawPath, relativeTo: baseURL) {
        return explicitFileURL
      }
      return bundleEntryURL(relativeTo: baseURL)
    }

    guard baseScheme == "http" || baseScheme == "https" else { return nil }
    guard
      let routeComponents = URLComponents(string: rawPath),
      var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: true)
    else { return nil }

    components.path = routeComponents.path.isEmpty ? rawPath : routeComponents.path
    components.query = routeComponents.query
    components.fragment = routeComponents.fragment
    return components.url
  }

  private func explicitFilePathURL(_ rawPath: String, relativeTo baseURL: URL) -> URL? {
    guard let routeComponents = URLComponents(string: rawPath) else { return nil }
    guard routeComponents.query == nil && routeComponents.fragment == nil else { return nil }
    let path = routeComponents.path
    guard path.contains(".") else { return nil }

    let relativePath = path.hasPrefix("/") ? String(path.dropFirst()) : path
    return bundleRootURL(relativeTo: baseURL)?.appendingPathComponent(relativePath)
  }

  private func canonicalRoute(from rawPath: String) -> String {
    guard let routeComponents = URLComponents(string: rawPath) else { return rawPath }

    var route = routeComponents.path
    if route.isEmpty {
      route = "/"
    }
    if let query = routeComponents.query, !query.isEmpty {
      route += "?\\(query)"
    }
    if let nestedFragment = routeComponents.fragment, !nestedFragment.isEmpty {
      route += "#\\(nestedFragment)"
    }
    return route
  }

  private func pendingFileSPARoute(for rawPath: String, resolvedURL: URL) -> String? {
    guard resolvedURL.isFileURL else { return nil }
    guard rawPath.hasPrefix("/") else { return nil }
    guard let routeComponents = URLComponents(string: rawPath) else { return nil }

    if routeComponents.query == nil && routeComponents.fragment == nil && routeComponents.path.contains(".") {
      return nil
    }

    return canonicalRoute(from: rawPath)
  }

  private func fallbackBaseURL() -> URL? {
    #if DEBUG
    if
      let rawURL = UserDefaults.standard.string(forKey: "nativite.dev.url"),
      let devURL = URL(string: rawURL)
    {
      return devURL
    }
    #endif

    return Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist")
  }

  private func bundleEntryURL(relativeTo baseURL: URL) -> URL? {
    if let bundled = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") {
      return bundled
    }
    if baseURL.lastPathComponent.lowercased() == "index.html" {
      return baseURL
    }
    return baseURL.deletingLastPathComponent().appendingPathComponent("index.html")
  }

  private func bundleRootURL(relativeTo baseURL: URL) -> URL? {
    return bundleEntryURL(relativeTo: baseURL)?.deletingLastPathComponent()
  }

  private func fileReadAccessURL(for targetURL: URL, relativeTo baseURL: URL?) -> URL {
    if let baseURL, baseURL.isFileURL {
      return baseURL.deletingLastPathComponent()
    }
    return targetURL.deletingLastPathComponent()
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "nativiteSheet" else { return }
    bridge?.sendEvent(name: "sheet.message", data: ["message": message.body])
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard let route = pendingSPARoute else { return }
    pendingSPARoute = nil
    applySPARoute(route)
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    emitLoadFailed(error, currentURL: webView.url)
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    emitLoadFailed(error, currentURL: webView.url)
  }

  private func applySPARoute(_ route: String) {
    let payload: [String: Any] = ["route": route]
    guard
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    else { return }

    let js = """
    (() => {
      const payload = \\(json);
      try {
        window.history.replaceState(window.history.state ?? null, "", payload.route);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch (_) {}
    })();
    """
    webView.evaluateJavaScript(js, completionHandler: nil)
  }

  private func emitLoadFailed(_ error: Error, currentURL: URL?) {
    let nsError = error as NSError
    let failingURL =
      (nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String) ??
      currentURL?.absoluteString
    var payload: [String: Any] = [
      "message": nsError.localizedDescription,
      "code": nsError.code,
      "domain": nsError.domain,
    ]
    if let failingURL {
      payload["url"] = failingURL
    }
    bridge?.sendEvent(name: "sheet.loadFailed", data: payload)
  }

  func sheetPresentationControllerDidChangeSelectedDetentIdentifier(
    _ controller: UISheetPresentationController
  ) {
    let detent: String
    if #available(iOS 16.0, *), controller.selectedDetentIdentifier == nativiteSmallDetentIdentifier {
      detent = "small"
    } else {
      switch controller.selectedDetentIdentifier {
      case .medium: detent = "medium"
      case .large: detent = "large"
      default: detent = "large"
      }
    }
    bridge?.sendEvent(name: "sheet.detentChanged", data: ["detent": detent])
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    bridge?.sendEvent(name: "sheet.dismissed", data: [:])
  }
}

// ─── UIColor hex extension ────────────────────────────────────────────────────

private extension UIColor {
  convenience init(hex: String) {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.hasPrefix("#") { cleaned.removeFirst() }
    let value = UInt64((cleaned.count == 6 ? cleaned + "FF" : cleaned), radix: 16) ?? 0xFFFFFFFF
    let r = CGFloat((value >> 24) & 0xFF) / 255
    let g = CGFloat((value >> 16) & 0xFF) / 255
    let b = CGFloat((value >> 8) & 0xFF) / 255
    let a = CGFloat(value & 0xFF) / 255
    self.init(red: r, green: g, blue: b, alpha: a)
  }
}`;

  // ── macOS implementation ──────────────────────────────────────────────────

  const macosChrome = `#elseif os(macOS)
import Cocoa

// NativiteChrome reconciles declarative chrome state from JS onto AppKit.
// Handles window title bar, menu bar, and sidebar — macOS equivalents of the
// iOS navigation bar, tab bar, etc.
class NativiteChrome: NSObject {

  weak var viewController: ViewController?
  weak var vars: NativiteVars?

  // Track built menu item actions for target-action dispatch.
  private var menuActions: [String: String] = [:] // tag → id

  // ── Entry point ────────────────────────────────────────────────────────────

  func applyState(_ args: Any?) {
    guard let state = args as? [String: Any] else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      if let windowState = state["window"] as? [String: Any] {
        self.applyWindow(windowState)
      }
      if let menuBarState = state["menuBar"] as? [String: Any] {
        self.applyMenuBar(menuBarState)
      }
      if let sidebarState = state["sidebar"] as? [String: Any] {
        self.applySidebar(sidebarState)
      }

      // Silently ignore iOS-only keys: navigationBar, tabBar, toolbar,
      // statusBar, homeIndicator, sheet, keyboard, searchBar
    }
  }

  // iOS-only in this phase.
  func postMessageToSheet(_ message: Any?) {
    _ = message
  }
${applyInitialStateMethod}
  // ── Window ──────────────────────────────────────────────────────────────────

  private func applyWindow(_ state: [String: Any]) {
    guard let window = viewController?.view.window else { return }

    if let title = state["title"] as? String {
      window.title = title
    }
    if let subtitle = state["subtitle"] as? String {
      window.subtitle = subtitle
    }
    if let titleVisibility = state["titleVisibility"] as? String {
      switch titleVisibility {
      case "hidden": window.titleVisibility = .hidden
      default:       window.titleVisibility = .visible
      }
    }
    if let separator = state["titlebarSeparatorStyle"] as? String {
      switch separator {
      case "none":       window.titlebarSeparatorStyle = .none
      case "shadow":     window.titlebarSeparatorStyle = .shadow
      case "line":       window.titlebarSeparatorStyle = .line
      default:           window.titlebarSeparatorStyle = .automatic
      }
    }
    if let fullSizeContent = state["fullSizeContentView"] as? Bool {
      if fullSizeContent {
        window.styleMask.insert(.fullSizeContentView)
        window.titlebarAppearsTransparent = true
      } else {
        window.styleMask.remove(.fullSizeContentView)
        window.titlebarAppearsTransparent = false
      }
    }
    if let hex = state["backgroundColor"] as? String {
      window.backgroundColor = NSColor(hex: hex)
    }

    // Push titlebar height to CSS vars
    let titlebarHeight = window.frame.height - window.contentLayoutRect.height
    vars?.updateChrome(
      navHeight: titlebarHeight, navVisible: true,
      tabHeight: nil, tabVisible: nil,
      toolbarHeight: nil, toolbarVisible: nil
    )
  }

  // ── Menu Bar ────────────────────────────────────────────────────────────────

  private func applyMenuBar(_ state: [String: Any]) {
    guard let menus = state["menus"] as? [[String: Any]] else { return }

    let mainMenu = NSMenu(title: "MainMenu")
    menuActions.removeAll()

    for menuState in menus {
      guard let title = menuState["title"] as? String else { continue }

      let submenu = NSMenu(title: title)
      let menuItem = NSMenuItem(title: title, action: nil, keyEquivalent: "")
      menuItem.submenu = submenu

      if let items = menuState["items"] as? [[String: Any]] {
        for itemState in items {
          if itemState["separator"] as? Bool == true {
            submenu.addItem(.separator())
            continue
          }

          guard let itemTitle = itemState["title"] as? String,
                let itemId = itemState["id"] as? String else { continue }

          let keyEquiv = itemState["keyEquivalent"] as? String ?? ""
          let item = NSMenuItem(
            title: itemTitle,
            action: #selector(menuItemClicked(_:)),
            keyEquivalent: keyEquiv
          )
          item.target = self
          item.tag = menuActions.count
          menuActions[String(item.tag)] = itemId

          if let disabled = itemState["disabled"] as? Bool, disabled {
            item.isEnabled = false
          }
          if let symbolName = itemState["systemImage"] as? String {
            item.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
          }

          submenu.addItem(item)
        }
      }

      mainMenu.addItem(menuItem)
    }

    NSApp.mainMenu = mainMenu
  }

  @objc private func menuItemClicked(_ sender: NSMenuItem) {
    guard let id = menuActions[String(sender.tag)] else { return }
    sendEvent(name: "menuBar.itemSelected", data: ["id": id])
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────

  private func applySidebar(_ state: [String: Any]) {
    guard let items = state["items"] as? [[String: Any]] else { return }

    // Fire a sidebar.itemSelected event with the full item list so the JS side
    // can reconcile. The actual NSSplitViewController wiring is deferred to a
    // later phase — for now we emit the event so the bridge contract is honoured.
    var sidebarItems: [[String: Any]] = []
    for itemState in items {
      guard let id = itemState["id"] as? String,
            let title = itemState["title"] as? String else { continue }
      var item: [String: Any] = ["id": id, "title": title]
      if let symbolName = itemState["systemImage"] as? String {
        item["systemImage"] = symbolName
      }
      sidebarItems.append(item)
    }

    if let selectedId = state["selectedItemId"] as? String {
      sendEvent(name: "sidebar.itemSelected", data: ["id": selectedId, "items": sidebarItems])
    }
  }
${sendEventMethod}
}

// ─── NSColor hex extension ────────────────────────────────────────────────────

private extension NSColor {
  convenience init(hex: String) {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.hasPrefix("#") { cleaned.removeFirst() }
    let value = UInt64((cleaned.count == 6 ? cleaned + "FF" : cleaned), radix: 16) ?? 0xFFFFFFFF
    let r = CGFloat((value >> 24) & 0xFF) / 255
    let g = CGFloat((value >> 16) & 0xFF) / 255
    let b = CGFloat((value >> 8) & 0xFF) / 255
    let a = CGFloat(value & 0xFF) / 255
    self.init(red: r, green: g, blue: b, alpha: a)
  }
}`;

  return `${iosChrome}

${macosChrome}
#endif
`;
}
