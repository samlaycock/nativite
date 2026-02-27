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

// NativiteChrome reconciles declarative chrome state from JS onto UIKit.
// Registered as a bridge handler under "__chrome_set_state__".
class NativiteChrome: NSObject {

  weak var viewController: ViewController?
  // NativiteVars receives geometry updates after each setState call so it can
  // keep --nk-nav-height, --nk-tab-height etc. in sync with the live UIKit state.
  weak var vars: NativiteVars?
  // NativiteKeyboard handles the input accessory bar and keyboard dismiss mode.
  weak var keyboard: NativiteKeyboard?

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
    let tabController  = vc.tabBarController

    let navH  = navController.map  { $0.navigationBar.frame.height } ?? 0
    let navV  = navController.map  { !$0.isNavigationBarHidden       } ?? false
    let tabH  = tabController.map  { $0.tabBar.frame.height          } ?? 0
    let tabV  = tabController.map  { !$0.tabBar.isHidden              } ?? false
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
    if let hidden = state["hidden"] as? Bool {
      navController.setNavigationBarHidden(hidden, animated: true)
    }
    if let leftItems = state["leftButtons"] as? [[String: Any]] {
      navItem.leftBarButtonItems = leftItems.compactMap { barButtonItem($0, position: "left") }
    }
    if let rightItems = state["rightButtons"] as? [[String: Any]] {
      navItem.rightBarButtonItems = rightItems.compactMap { barButtonItem($0, position: "right") }
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

    let item: UIBarButtonItem
    if let symbolName = state["systemImage"] as? String,
       let image = UIImage(systemName: symbolName) {
      item = UIBarButtonItem(image: image, style: style, target: self, action: #selector(barButtonTapped(_:)))
    } else if let title = state["title"] as? String {
      item = UIBarButtonItem(title: title, style: style, target: self, action: #selector(barButtonTapped(_:)))
    } else {
      return nil
    }

    item.accessibilityIdentifier = "\\(position):\\(id)"
    item.isEnabled = !((state["disabled"] as? Bool) ?? false)
    return item
  }

  @objc private func barButtonTapped(_ sender: UIBarButtonItem) {
    guard let identifier = sender.accessibilityIdentifier else { return }
    let parts = identifier.split(separator: ":").map(String.init)
    guard parts.count == 2 else { return }
    sendEvent(name: "navigationBar.buttonTapped", data: ["id": parts[1]])
  }

  // ── Tab Bar ────────────────────────────────────────────────────────────────

  private func applyTabBar(_ state: [String: Any]) {
    guard let vc = viewController,
          let tabController = vc.tabBarController else { return }

    let tabBar = tabController.tabBar

    if let items = state["items"] as? [[String: Any]] {
      let tabItems = items.enumerated().compactMap { (index, itemState) -> UITabBarItem? in
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
      // Distribute the tab items across the existing view controllers
      tabController.viewControllers?.enumerated().forEach { (index, viewController) in
        if index < tabItems.count {
          viewController.tabBarItem = tabItems[index]
        }
      }
    }

    if let selectedId = state["selectedTabId"] as? String {
      let index = tabController.viewControllers?
        .firstIndex(where: { $0.tabBarItem.accessibilityIdentifier == selectedId })
      if let index {
        tabController.selectedIndex = index
      }
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
      tabController.tabBar.isHidden = hidden
    }
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  private func applyToolbar(_ state: [String: Any]) {
    guard let vc = viewController,
          let navController = vc.navigationController else { return }

    if let hidden = state["hidden"] as? Bool {
      navController.setToolbarHidden(hidden, animated: true)
    }
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

  private func toolbarItem(_ state: [String: Any]) -> UIBarButtonItem? {
    switch state["type"] as? String {
    case "flexibleSpace":
      return UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
    case "fixedSpace":
      let item = UIBarButtonItem(barButtonSystemItem: .fixedSpace, target: nil, action: nil)
      item.width = state["width"] as? CGFloat ?? 8
      return item
    default:
      return barButtonItem(state, position: "toolbar")
    }
  }

  @objc private func toolbarButtonTapped(_ sender: UIBarButtonItem) {
    guard let id = sender.accessibilityIdentifier else { return }
    sendEvent(name: "toolbar.buttonTapped", data: ["id": id])
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
      if vc.presentedViewController == nil {
        let sheetVC = NativiteSheetViewController()
        sheetVC.bridge = self

        if let sheet = sheetVC.sheetPresentationController {
          if let detentStrings = state["detents"] as? [String] {
            sheet.detents = detentStrings.compactMap { sheetDetent(from: $0) }
          } else {
            sheet.detents = [.medium(), .large()]
          }
          if let selectedDetent = state["selectedDetent"] as? String {
            sheet.selectedDetentIdentifier = sheetDetentIdentifier(from: selectedDetent)
          }
          sheet.prefersGrabberVisible = state["grabberVisible"] as? Bool ?? false
          if let radius = state["cornerRadius"] as? CGFloat {
            sheet.preferredCornerRadius = radius
          }
          sheet.delegate = sheetVC
        }
        if let hex = state["backgroundColor"] as? String {
          sheetVC.view.backgroundColor = UIColor(hex: hex)
        }

        vc.present(sheetVC, animated: true)
      }
    } else {
      if vc.presentedViewController is NativiteSheetViewController {
        vc.dismiss(animated: true)
      }
    }
  }

  private func sheetDetent(from string: String) -> UISheetPresentationController.Detent? {
    switch string {
    case "medium": return .medium()
    case "large": return .large()
    default: return nil
    }
  }

  private func sheetDetentIdentifier(
    from string: String
  ) -> UISheetPresentationController.Detent.Identifier? {
    switch string {
    case "medium": return .medium
    case "large": return .large
    default: return nil
    }
  }
${sendEventMethod}
}

// ─── Supporting: NativiteSheetViewController ─────────────────────────────────

private class NativiteSheetViewController: UIViewController,
  UISheetPresentationControllerDelegate
{
  weak var bridge: NativiteChrome?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
  }

  func sheetPresentationControllerDidChangeSelectedDetentIdentifier(
    _ controller: UISheetPresentationController
  ) {
    let detent: String
    switch controller.selectedDetentIdentifier {
    case .medium: detent = "medium"
    case .large: detent = "large"
    default: detent = "large"
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
