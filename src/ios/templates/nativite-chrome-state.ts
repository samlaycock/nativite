// NativiteChromeState is a SwiftUI @Observable model that bridges between the
// imperative NativiteChrome reconciliation engine and the declarative SwiftUI
// view layer. Areas that have been migrated to SwiftUI update this model,
// which SwiftUI views observe. Areas still in UIKit continue using the
// existing imperative approach.

export function nativiteChromeStateTemplate(): string {
  return `import SwiftUI
import WebKit

// ─── NativiteChromeState ──────────────────────────────────────────────────────
// @Observable model bridging JS chrome state to SwiftUI views.
//
// NativiteChrome (the imperative reconciler) writes to this model when it
// receives state from JS. SwiftUI views observe properties for the chrome
// areas that have been migrated (sheets, alerts, status bar, home indicator).

@Observable
final class NativiteChromeState {

  // ── Sheets ──────────────────────────────────────────────────────────────────
  // Tracks all active sheet presentations. Keyed by the JS-side name.

  var sheets: [String: SheetState] = [:]

  struct SheetState: Identifiable {
    let id: String        // Same as the dictionary key (JS sheet name)
    var presented: Bool = false
    var url: String?
    var detents: [SheetDetent] = [.medium, .large]
    var activeDetent: SheetDetent?
    var grabberVisible: Bool = false
    var cornerRadius: CGFloat?
    var backgroundColor: String?  // Hex string
    var backgroundBlur: Bool = false
    var dismissible: Bool = true
  }

  enum SheetDetent: String, Identifiable {
    case small, medium, large, full
    var id: String { rawValue }
  }

  // ── Alerts ──────────────────────────────────────────────────────────────────
  // Queued JS alert/confirm/prompt dialogs that SwiftUI presents modally.

  var activeAlert: AlertState?

  struct AlertState: Identifiable {
    let id = UUID()
    var message: String
    var type: AlertType
    var defaultText: String?
    var completion: ((AlertResult) -> Void)?
  }

  enum AlertType {
    case alert
    case confirm
    case prompt
  }

  enum AlertResult {
    case ok
    case cancel
    case text(String?)
  }

  // ── Status Bar (iOS) ────────────────────────────────────────────────────────

  var statusBarHidden: Bool = false
  var statusBarStyle: StatusBarStyleValue = .default_

  enum StatusBarStyleValue {
    case default_, light, dark
  }

  // ── Home Indicator (iOS) ────────────────────────────────────────────────────

  var homeIndicatorHidden: Bool = false

  // ── Splash Overlay (iOS) ──────────────────────────────────────────────────
  // Starts true; set to false by ViewController once the first page load
  // completes (didFinish). SwiftUI observes this to fade out the splash.
  var splashVisible: Bool = true

  // ── Title Bar ────────────────────────────────────────────────────────────────
  // Mirrors the iOS UINavigationItem / macOS NSWindow title bar state.
  // NativiteChrome.applyTitleBar writes to these; SwiftUI observes them.

  var titleBarTitle: String = ""
  var titleBarSubtitle: String?
  var titleBarHidden: Bool = false
  // Default to inline because the embedded WKWebView cannot participate in
  // SwiftUI's scroll-to-collapse behaviour. With .automatic (= .large for
  // root views), the large title is permanently stuck in the expanded state
  // and renders on a separate row that overlaps the web content.
  var titleBarLargeTitleMode: LargeTitleMode = .inline
  var titleBarBackLabel: String?
  var titleBarTint: String?
  var titleBarLeadingItems: [BarItemState] = []
  var titleBarTrailingItems: [BarItemState] = []
  var searchBar: SearchBarState?

  enum LargeTitleMode: String {
    case automatic, large, inline
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────────
  // Mirrors the iOS UIToolbar / macOS NSToolbar items.

  var toolbarHidden: Bool = false
  var toolbarItems: [BarItemState] = []

  // macOS toolbar extensions ──────────────────────────────────────────────────

  enum ToolbarPlacement: String {
    case automatic
    case principal
    case secondaryAction
    case navigation
    case primaryAction
  }

  enum ToolbarDisplayMode: String {
    case iconAndLabel
    case iconOnly
    case labelOnly
  }

  struct ToolbarGroupState {
    var placement: ToolbarPlacement = .automatic
    var items: [BarItemState] = []
  }

  var toolbarGroups: [ToolbarGroupState] = []
  var toolbarCustomizable: Bool = false
  var toolbarId: String?
  var toolbarDisplayMode: ToolbarDisplayMode = .iconAndLabel
  var toolbarStyle: String = "unified"

  // ── Bar Item State ──────────────────────────────────────────────────────────
  // Unified model for title bar buttons, toolbar items, and menu items.

  struct BarItemState: Identifiable {
    let id: String
    var label: String?
    var icon: String?          // SF Symbol name
    var style: ItemStyle = .plain
    var tint: String?          // Hex colour (e.g. "#FF6600")
    var disabled: Bool = false
    var checked: Bool = false
    var badge: String?
    var menu: MenuState?
    var itemType: ItemType = .button
    var customization: CustomizationBehavior = .defaultBehavior

    enum ItemStyle: String {
      case plain, primary, destructive
    }

    enum ItemType: String {
      case button
      case flexibleSpace = "flexible-space"
      case fixedSpace = "fixed-space"
    }

    enum CustomizationBehavior: String {
      case defaultBehavior = "default"
      case hidden
      case required
    }

    #if os(iOS)
    /// Resolved tint colour: per-item hex → destructive red → nil (inherit).
    var resolvedTint: Color? {
      if let hex = tint { return Color(uiColor: UIColor(hex: hex)) }
      if style == .destructive { return .red }
      return nil
    }
    #endif
  }

  struct MenuState {
    var title: String = ""
    var items: [MenuItemState] = []
  }

  struct MenuItemState: Identifiable {
    let id: String
    var label: String
    var icon: String?
    var disabled: Bool = false
    var checked: Bool = false
    var style: BarItemState.ItemStyle = .plain
    var keyEquivalent: String?
    var children: [MenuItemState]?
  }

  struct SearchBarState {
    var placeholder: String?
    var value: String?
    var cancelButtonVisible: Bool = false
  }

  // ── Navigation (Tabs) ──────────────────────────────────────────────────────
  // Mirrors the iOS UITabBarController / macOS NSSegmentedControl tab state.

  var navigationItems: [NavigationItemState] = []
  var navigationActiveItem: String?
  var navigationHidden: Bool = false
  var navigationStyle: String = "auto"

  struct NavigationItemState: Identifiable {
    let id: String
    var label: String
    var icon: String?         // SF Symbol name
    var badge: String?
    var role: String?         // "search", nil for normal tab
    var hidden: Bool = false
  }

  // ── Sidebar Panel (macOS) ──────────────────────────────────────────────────
  // Mirrors the macOS NSSplitViewController sidebar.

  var sidebarItems: [SidebarItemState] = []
  var sidebarActiveItem: String?
  var sidebarTitle: String?
  var sidebarWidth: CGFloat?
  var sidebarVisible: Bool = true
  var sidebarCollapsed: Bool = false

  struct SidebarItemState: Identifiable {
    let id: String
    var label: String
    var icon: String?
    var children: [SidebarItemState]?
  }

  // ── Menu Bar (macOS) ───────────────────────────────────────────────────────
  // Mirrors the macOS NSMenu / NSMenuItem menu bar.

  var menuBarMenus: [MenuBarMenuState] = []

  struct MenuBarMenuState: Identifiable {
    let id: String
    var title: String
    var items: [MenuItemState] = []
  }

  // ── Drawers (macOS) ────────────────────────────────────────────────────────

  var drawers: [String: DrawerState] = [:]

  struct DrawerState: Identifiable {
    let id: String
    var presented: Bool = false
    var url: String?
    var width: CGFloat = 300
    var edge: DrawerEdge = .trailing
    var backgroundColor: String?
  }

  enum DrawerEdge: String {
    case leading, trailing
  }

  // ── Popovers ───────────────────────────────────────────────────────────────

  var popovers: [String: PopoverState] = [:]

  struct PopoverState: Identifiable {
    let id: String
    var presented: Bool = false
    var url: String?
    var width: CGFloat = 320
    var height: CGFloat = 480
    var backgroundColor: String?
  }

  // ── App Windows (macOS) ────────────────────────────────────────────────────

  var appWindows: [String: AppWindowState] = [:]

  struct AppWindowState: Identifiable {
    let id: String
    var presented: Bool = false
    var url: String?
    var width: CGFloat = 800
    var height: CGFloat = 600
    var title: String?
    var backgroundColor: String?
    var modal: Bool = false
    var resizable: Bool = true
  }

  // ── Event Callback ─────────────────────────────────────────────────────────
  // Set by NativiteChrome so SwiftUI views can route user interactions
  // (button taps, search text changes, etc.) back to the JS bridge.

  var onChromeEvent: ((String, [String: Any]) -> Void)?

  // ── View Controller References ──────────────────────────────────────────────
  // Set by ViewController during setup. Used by SwiftUI modifiers to resolve
  // URLs relative to the primary webview and route events through the bridge.

  weak var bridge: NativiteBridge?
  weak var primaryWebView: WKWebView?

  // ── Child WebView Registry ──────────────────────────────────────────────────
  // Tracks child webviews (sheets, drawers, etc.) for message routing.

  var childWebViews: [String: WKWebView] = [:]

  // ── Helpers ─────────────────────────────────────────────────────────────────

  func updateSheet(name: String, state: [String: Any]) {
    let presented = state["presented"] as? Bool ?? false

    if presented {
      var sheet = sheets[name] ?? SheetState(id: name)
      sheet.presented = true
      if let url = state["url"] as? String {
        sheet.url = url
      }
      if let detentStrings = state["detents"] as? [String] {
        sheet.detents = detentStrings.compactMap { SheetDetent(rawValue: $0) }
        if sheet.detents.isEmpty { sheet.detents = [.medium, .large] }
      }
      if let activeDetent = state["activeDetent"] as? String {
        sheet.activeDetent = SheetDetent(rawValue: activeDetent)
      }
      sheet.grabberVisible = state["grabberVisible"] as? Bool ?? false
      if let radius = state["cornerRadius"] as? NSNumber {
        sheet.cornerRadius = CGFloat(truncating: radius)
      }
      sheet.backgroundColor = state["backgroundColor"] as? String
      sheet.backgroundBlur = state["backgroundBlur"] as? Bool ?? false
      sheet.dismissible = state["dismissible"] as? Bool ?? true
      sheets[name] = sheet
    } else {
      sheets[name]?.presented = false
    }
  }

  func updateStatusBar(_ state: [String: Any]) {
    if let style = state["style"] as? String {
      switch style {
      case "light": statusBarStyle = .light
      case "dark":  statusBarStyle = .dark
      default:      statusBarStyle = .default_
      }
    }
    if let hidden = state["hidden"] as? Bool {
      statusBarHidden = hidden
    }
  }

  func updateHomeIndicator(_ state: [String: Any]) {
    if let hidden = state["hidden"] as? Bool {
      homeIndicatorHidden = hidden
    }
  }

  func resetStatusBar() {
    statusBarStyle = .default_
    statusBarHidden = false
  }

  func resetHomeIndicator() {
    homeIndicatorHidden = false
  }

  func resetSheets() {
    for key in sheets.keys {
      sheets[key]?.presented = false
    }
  }

  // ── Title Bar + Toolbar Update Helpers ───────────────────────────────────

  func updateTitleBar(_ state: [String: Any]) {
    if let title = state["title"] as? String {
      titleBarTitle = title
    }
    if let subtitle = state["subtitle"] as? String {
      titleBarSubtitle = subtitle
    } else if state["subtitle"] is NSNull {
      titleBarSubtitle = nil
    }
    if let mode = state["largeTitleMode"] as? String {
      titleBarLargeTitleMode = LargeTitleMode(rawValue: mode) ?? .automatic
    }
    if let backLabel = state["backLabel"] as? String {
      titleBarBackLabel = backLabel
    } else if state["backLabel"] is NSNull {
      titleBarBackLabel = nil
    }
    titleBarHidden = (state["hidden"] as? Bool) ?? false
    if let tint = state["tint"] as? String {
      titleBarTint = tint
    } else if state["tint"] is NSNull {
      titleBarTint = nil
    }

    if let leadingItems = state["leadingItems"] as? [[String: Any]] {
      titleBarLeadingItems = leadingItems.compactMap { parseBarItem($0) }
    }
    if let trailingItems = state["trailingItems"] as? [[String: Any]] {
      titleBarTrailingItems = trailingItems.compactMap { parseBarItem($0) }
    }
    if let searchBarState = state["searchBar"] as? [String: Any] {
      var sb = searchBar ?? SearchBarState()
      if let placeholder = searchBarState["placeholder"] as? String {
        sb.placeholder = placeholder
      }
      if let value = searchBarState["value"] as? String {
        sb.value = value
      }
      sb.cancelButtonVisible = searchBarState["cancelButtonVisible"] as? Bool ?? false
      searchBar = sb
    }
  }

  func updateToolbar(_ state: [String: Any]) {
    toolbarHidden = (state["hidden"] as? Bool) ?? false

    // Parse flat items (backward compatible, used by iOS bottom bar)
    if let items = state["items"] as? [[String: Any]] {
      toolbarItems = items.compactMap { parseBarItem($0) }
    } else if let groups = state["groups"] as? [[String: Any]] {
      // Flatten groups into toolbarItems for iOS/Android bottom bar fallback
      toolbarItems = groups.flatMap { group -> [BarItemState] in
        (group["items"] as? [[String: Any]])?.compactMap { parseBarItem($0) } ?? []
      }
    } else {
      toolbarItems = []
    }

    // Parse placement groups (used by macOS toolbar modifier)
    if let groups = state["groups"] as? [[String: Any]] {
      toolbarGroups = groups.compactMap { group in
        let placement = ToolbarPlacement(
          rawValue: (group["placement"] as? String) ?? "automatic"
        ) ?? .automatic
        let items = (group["items"] as? [[String: Any]])?.compactMap { parseBarItem($0) } ?? []
        return ToolbarGroupState(placement: placement, items: items)
      }
    } else {
      toolbarGroups = []
    }

    toolbarCustomizable = (state["customizable"] as? Bool) ?? false
    toolbarId = state["id"] as? String
    if let dm = state["displayMode"] as? String {
      toolbarDisplayMode = ToolbarDisplayMode(rawValue: dm) ?? .iconAndLabel
    } else {
      toolbarDisplayMode = .iconAndLabel
    }
    toolbarStyle = (state["toolbarStyle"] as? String) ?? "unified"
  }

  func resetTitleBar() {
    titleBarTitle = ""
    titleBarSubtitle = nil
    titleBarHidden = false
    titleBarLargeTitleMode = .inline
    titleBarTint = nil
    titleBarBackLabel = nil
    titleBarLeadingItems = []
    titleBarTrailingItems = []
    searchBar = nil
  }

  func resetToolbar() {
    toolbarHidden = false
    toolbarItems = []
    toolbarGroups = []
    toolbarCustomizable = false
    toolbarId = nil
    toolbarDisplayMode = .iconAndLabel
    toolbarStyle = "unified"
  }

  // ── Navigation Update Helpers ──────────────────────────────────────────

  func updateNavigation(_ state: [String: Any]) {
    navigationStyle = (state["style"] as? String) ?? "auto"
    navigationHidden = (state["hidden"] as? Bool) ?? false
    if let activeItem = state["activeItem"] as? String {
      navigationActiveItem = activeItem
    }
    if let items = state["items"] as? [[String: Any]] {
      navigationItems = items.compactMap { parseNavigationItem($0) }
    }
  }

  func resetNavigation() {
    navigationItems = []
    navigationActiveItem = nil
    navigationHidden = false
    navigationStyle = "auto"
  }

  // ── Sidebar Update Helpers ─────────────────────────────────────────────

  func updateSidebarPanel(_ state: [String: Any]) {
    sidebarVisible = (state["visible"] as? Bool) ?? true
    sidebarCollapsed = (state["collapsed"] as? Bool) ?? false
    if let title = state["title"] as? String {
      sidebarTitle = title
    } else if state["title"] is NSNull {
      sidebarTitle = nil
    }
    if let width = state["width"] as? NSNumber {
      sidebarWidth = CGFloat(truncating: width)
    }
    if let activeItem = state["activeItem"] as? String {
      sidebarActiveItem = activeItem
    }
    if let items = state["items"] as? [[String: Any]] {
      sidebarItems = items.compactMap { parseSidebarItem($0) }
    }
  }

  func resetSidebarPanel() {
    sidebarItems = []
    sidebarActiveItem = nil
    sidebarTitle = nil
    sidebarWidth = nil
    sidebarVisible = true
    sidebarCollapsed = false
  }

  // ── Menu Bar Update Helpers ────────────────────────────────────────────

  func updateMenuBar(_ state: [String: Any]) {
    if let menus = state["menus"] as? [[String: Any]] {
      menuBarMenus = menus.compactMap { menuState in
        guard let id = menuState["id"] as? String else { return nil }
        let title = (menuState["title"] as? String) ?? (menuState["label"] as? String) ?? ""
        if title.isEmpty { return nil }
        var menu = MenuBarMenuState(id: id, title: title)
        if let items = menuState["items"] as? [[String: Any]] {
          menu.items = items.compactMap { parseMenuItem($0) }
        }
        return menu
      }
    }
  }

  func resetMenuBar() {
    menuBarMenus = []
  }

  // ── Drawer / Popover / AppWindow Update Helpers ────────────────────────

  func updateDrawer(name: String, state: [String: Any]) {
    let presented = state["presented"] as? Bool ?? false
    if presented {
      var drawer = drawers[name] ?? DrawerState(id: name)
      drawer.presented = true
      drawer.url = state["url"] as? String
      if let width = state["width"] as? NSNumber {
        drawer.width = CGFloat(truncating: width)
      } else if let width = state["width"] as? String {
        switch width {
        case "small": drawer.width = 200
        case "large": drawer.width = 400
        default: break
        }
      }
      if let edge = state["edge"] as? String {
        drawer.edge = DrawerEdge(rawValue: edge) ?? .trailing
      } else if let side = state["side"] as? String {
        drawer.edge = DrawerEdge(rawValue: side) ?? .trailing
      }
      drawer.backgroundColor = state["backgroundColor"] as? String
      drawers[name] = drawer
    } else {
      drawers[name]?.presented = false
    }
  }

  func updatePopover(name: String, state: [String: Any]) {
    let presented = state["presented"] as? Bool ?? false
    if presented {
      var popover = popovers[name] ?? PopoverState(id: name)
      popover.presented = true
      popover.url = state["url"] as? String
      if let width = state["width"] as? NSNumber {
        popover.width = CGFloat(truncating: width)
      } else if let size = state["size"] as? [String: Any],
                let width = size["width"] as? NSNumber {
        popover.width = CGFloat(truncating: width)
      }
      if let height = state["height"] as? NSNumber {
        popover.height = CGFloat(truncating: height)
      } else if let size = state["size"] as? [String: Any],
                let height = size["height"] as? NSNumber {
        popover.height = CGFloat(truncating: height)
      }
      popover.backgroundColor = state["backgroundColor"] as? String
      popovers[name] = popover
    } else {
      popovers[name]?.presented = false
    }
  }

  func updateAppWindow(name: String, state: [String: Any]) {
    let presented = state["presented"] as? Bool ?? false
    if presented {
      var window = appWindows[name] ?? AppWindowState(id: name)
      window.presented = true
      window.url = state["url"] as? String
      if let width = state["width"] as? NSNumber {
        window.width = CGFloat(truncating: width)
      } else if let size = state["size"] as? [String: Any],
                let width = size["width"] as? NSNumber {
        window.width = CGFloat(truncating: width)
      }
      if let height = state["height"] as? NSNumber {
        window.height = CGFloat(truncating: height)
      } else if let size = state["size"] as? [String: Any],
                let height = size["height"] as? NSNumber {
        window.height = CGFloat(truncating: height)
      }
      window.title = state["title"] as? String
      window.backgroundColor = state["backgroundColor"] as? String
      window.modal = state["modal"] as? Bool ?? false
      window.resizable = state["resizable"] as? Bool ?? true
      appWindows[name] = window
    } else {
      appWindows[name]?.presented = false
    }
  }

  func resetDrawers() {
    for key in drawers.keys { drawers[key]?.presented = false }
  }

  func resetPopovers() {
    for key in popovers.keys { popovers[key]?.presented = false }
  }

  func resetAppWindows() {
    for key in appWindows.keys { appWindows[key]?.presented = false }
  }

  // ── Navigation Item Parsing ─────────────────────────────────────────────

  private func parseNavigationItem(_ state: [String: Any]) -> NavigationItemState? {
    guard let id = state["id"] as? String,
          let label = state["label"] as? String else { return nil }
    var item = NavigationItemState(id: id, label: label)
    item.icon = state["icon"] as? String
    if let badge = state["badge"] as? String {
      item.badge = badge
    } else if let badge = state["badge"] as? Int {
      item.badge = String(badge)
    }
    item.role = state["role"] as? String
    item.hidden = (state["hidden"] as? Bool) ?? false
    return item
  }

  private func parseSidebarItem(_ state: [String: Any]) -> SidebarItemState? {
    guard let id = state["id"] as? String,
          let label = state["label"] as? String else { return nil }
    var item = SidebarItemState(id: id, label: label)
    item.icon = state["icon"] as? String
    if let children = state["children"] as? [[String: Any]] {
      item.children = children.compactMap { parseSidebarItem($0) }
    }
    return item
  }

  // ── Parsing Helpers ─────────────────────────────────────────────────────

  private func parseBarItem(_ state: [String: Any]) -> BarItemState? {
    // Handle space types first — they don't require an id
    if let type = state["type"] as? String {
      if type == "flexible-space" {
        return BarItemState(id: UUID().uuidString, itemType: .flexibleSpace)
      }
      if type == "fixed-space" {
        return BarItemState(id: UUID().uuidString, itemType: .fixedSpace)
      }
    }

    guard let id = state["id"] as? String else { return nil }
    var item = BarItemState(id: id)
    item.label = state["label"] as? String
    item.icon = state["icon"] as? String
    if let style = state["style"] as? String {
      item.style = BarItemState.ItemStyle(rawValue: style) ?? .plain
    }
    item.tint = state["tint"] as? String
    item.disabled = (state["disabled"] as? Bool) ?? false
    item.checked = (state["checked"] as? Bool) ?? false
    if let badge = state["badge"] as? String {
      item.badge = badge
    } else if let badge = state["badge"] as? Int {
      item.badge = String(badge)
    }

    if let menuState = state["menu"] as? [String: Any] {
      item.menu = parseMenu(menuState)
    }

    if let customization = state["customization"] as? String {
      item.customization = BarItemState.CustomizationBehavior(rawValue: customization) ?? .defaultBehavior
    }

    return item
  }

  private func parseMenu(_ state: [String: Any]) -> MenuState {
    var menu = MenuState()
    menu.title = state["title"] as? String ?? ""
    if let items = state["items"] as? [[String: Any]] {
      menu.items = items.compactMap { parseMenuItem($0) }
    }
    return menu
  }

  private func parseMenuItem(_ state: [String: Any]) -> MenuItemState? {
    guard let id = state["id"] as? String,
          let label = state["label"] as? String else { return nil }

    var item = MenuItemState(id: id, label: label)
    item.icon = state["icon"] as? String
    item.disabled = (state["disabled"] as? Bool) ?? false
    item.checked = (state["checked"] as? Bool) ?? false
    if let style = state["style"] as? String {
      item.style = BarItemState.ItemStyle(rawValue: style) ?? .plain
    }
    item.keyEquivalent = state["keyEquivalent"] as? String
    if let children = state["children"] as? [[String: Any]] {
      item.children = children.compactMap { parseMenuItem($0) }
    }
    return item
  }

  func enqueueAlert(message: String, type: AlertType, defaultText: String? = nil, completion: @escaping (AlertResult) -> Void) {
    activeAlert = AlertState(
      message: message,
      type: type,
      defaultText: defaultText,
      completion: completion
    )
  }

  func dismissAlert() {
    activeAlert = nil
  }
}

// ─── NativiteChildWebView ───────────────────────────────────────────────────
// A lightweight child webview wrapper used inside SwiftUI sheets, drawers,
// popovers, and app windows. Shares the same WKWebsiteDataStore as the
// primary webview for cross-instance storage (localStorage, IndexedDB, cookies).

#if os(iOS)
import UIKit

struct NativiteChildWebView: UIViewRepresentable {
  let instanceName: String
  let url: URL?
  let baseURL: URL?
  weak var bridge: NativiteBridge?
  let chromeState: NativiteChromeState?
  let backgroundColor: String?

  func makeUIView(context: Context) -> NativiteWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = WKWebsiteDataStore.default()
    let nvPlatform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
    config.applicationNameForUserAgent = "Nativite/\\(nvPlatform)/1.0"
    config.userContentController.addUserScript(WKUserScript(
      source: "window.__nativekit_instance_name__ = \\"\\(instanceName)\\";document.documentElement.setAttribute('data-nv-platform','\\(nvPlatform)');document.documentElement.setAttribute('data-nv-theme',window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');(function(){var s=document.createElement('style');s.textContent=':root{color-scheme:light dark}';document.documentElement.appendChild(s)})();",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
    if let bridge {
      config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "nativite")
    }

    let webView = NativiteWebView(frame: .zero, configuration: config)
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    webView.underPageBackgroundColor = .systemBackground
    webView.lockRootScroll = false
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.isScrollEnabled = true
    webView.scrollView.bounces = false
    webView.scrollView.alwaysBounceVertical = false
    webView.scrollView.alwaysBounceHorizontal = false
    webView.navigationDelegate = context.coordinator
    #if DEBUG
    if #available(iOS 16.4, *) {
      webView.isInspectable = true
    }
    #endif

    if let bgHex = backgroundColor {
      webView.backgroundColor = UIColor(hex: bgHex)
    }

    // Register in chromeState so messaging (postToChild, broadcast) can reach this webview.
    chromeState?.childWebViews[instanceName] = webView

    return webView
  }

  func updateUIView(_ webView: NativiteWebView, context: Context) {
    guard let url else { return }
    // Avoid reloading the same URL on every SwiftUI update.
    if webView.url?.absoluteURL != url.absoluteURL {
      if url.isFileURL {
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
      } else {
        webView.load(URLRequest(url: url))
      }
    }
  }

  static func dismantleUIView(_ webView: NativiteWebView, coordinator: Coordinator) {
    coordinator.chromeState?.childWebViews.removeValue(forKey: coordinator.instanceName)
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(instanceName: instanceName, chromeState: chromeState)
  }

  class Coordinator: NSObject, WKNavigationDelegate {
    let instanceName: String
    weak var chromeState: NativiteChromeState?

    init(instanceName: String, chromeState: NativiteChromeState?) {
      self.instanceName = instanceName
      self.chromeState = chromeState
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {}
  }
}

#elseif os(macOS)
import Cocoa

struct NativiteChildWebView: NSViewRepresentable {
  let instanceName: String
  let url: URL?
  let baseURL: URL?
  weak var bridge: NativiteBridge?
  let chromeState: NativiteChromeState?
  let backgroundColor: String?

  func makeNSView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = WKWebsiteDataStore.default()
    config.applicationNameForUserAgent = "Nativite/macos/1.0"
    config.userContentController.addUserScript(WKUserScript(
      source: "window.__nativekit_instance_name__ = \\"\\(instanceName)\\";document.documentElement.setAttribute('data-nv-platform','macos');document.documentElement.setAttribute('data-nv-theme',window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');(function(){var s=document.createElement('style');s.textContent=':root{color-scheme:light dark}';document.documentElement.appendChild(s)})();",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
    if let bridge {
      config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "nativite")
    }

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.underPageBackgroundColor = .windowBackgroundColor
    webView.navigationDelegate = context.coordinator
    #if DEBUG
    if #available(macOS 13.3, *) {
      webView.isInspectable = true
    }
    #endif

    // Register in chromeState so messaging (postToChild, broadcast) can reach this webview.
    chromeState?.childWebViews[instanceName] = webView

    return webView
  }

  func updateNSView(_ webView: WKWebView, context: Context) {
    guard let url else { return }
    if webView.url?.absoluteURL != url.absoluteURL {
      if url.isFileURL {
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
      } else {
        webView.load(URLRequest(url: url))
      }
    }
  }

  static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
    coordinator.chromeState?.childWebViews.removeValue(forKey: coordinator.instanceName)
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(instanceName: instanceName, chromeState: chromeState)
  }

  class Coordinator: NSObject, WKNavigationDelegate {
    let instanceName: String
    weak var chromeState: NativiteChromeState?

    init(instanceName: String, chromeState: NativiteChromeState?) {
      self.instanceName = instanceName
      self.chromeState = chromeState
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {}
  }
}
#endif

// ─── SwiftUI Sheet Presentation ─────────────────────────────────────────────
// View modifier that presents child webview sheets driven by NativiteChromeState.

struct NativiteSheetModifier: ViewModifier {
  @Bindable var chromeState: NativiteChromeState
  /// Tracks the name of the currently-presented sheet so onDismiss can
  /// reliably reference it after SwiftUI has already nil-ed the binding.
  @State private var presentedSheetName: String?

  func body(content: Content) -> some View {
    content
      .sheet(
        item: activeSheet,
        onDismiss: {
          if let name = presentedSheetName {
            chromeState.sheets[name]?.presented = false
            sendEvent(name: "sheet.dismissed", data: ["name": name])
            presentedSheetName = nil
          }
        }
      ) { sheet in
        sheetContent(for: sheet)
      }
      .onChange(of: chromeState.sheets.values.first(where: { $0.presented })?.id) { _, newValue in
        if let name = newValue {
          presentedSheetName = name
        }
      }
  }

  private var activeSheet: Binding<NativiteChromeState.SheetState?> {
    Binding(
      get: { chromeState.sheets.values.first(where: { $0.presented }) },
      set: { newValue in
        if newValue == nil {
          for key in chromeState.sheets.keys {
            chromeState.sheets[key]?.presented = false
          }
        }
      }
    )
  }

  @ViewBuilder
  private func sheetContent(for sheet: NativiteChromeState.SheetState) -> some View {
    let resolvedURL = resolveSheetURL(sheet.url)
    NativiteChildWebView(
      instanceName: sheet.id,
      url: resolvedURL,
      baseURL: chromeState.primaryWebView?.url,
      bridge: chromeState.bridge,
      chromeState: chromeState,
      backgroundColor: sheet.backgroundColor
    )
    .presentationDetents(swiftUIDetents(from: sheet.detents))
    .presentationDragIndicator(sheet.grabberVisible ? .visible : .hidden)
    .presentationCornerRadius(sheet.cornerRadius ?? 12)
    .interactiveDismissDisabled(!sheet.dismissible)
    #if os(iOS)
    .presentationBackgroundInteraction(.enabled)
    #endif
    .onAppear {
      sendEvent(name: "sheet.presented", data: ["name": sheet.id])
    }
  }

  private func resolveSheetURL(_ rawURL: String?) -> URL? {
    guard let rawURL else { return nil }
    if let url = URL(string: rawURL), url.scheme != nil {
      return url
    }
    guard let baseURL = chromeState.primaryWebView?.url else { return nil }
    return URL(string: rawURL, relativeTo: baseURL)
  }

  private func swiftUIDetents(from detents: [NativiteChromeState.SheetDetent]) -> Set<PresentationDetent> {
    var result = Set<PresentationDetent>()
    for detent in detents {
      switch detent {
      case .small:  result.insert(.fraction(0.25))
      case .medium: result.insert(.medium)
      case .large:  result.insert(.large)
      case .full:   result.insert(.fraction(1.0))
      }
    }
    return result.isEmpty ? [.medium, .large] : result
  }

  private func sendEvent(name: String, data: [String: Any]) {
    guard let bridge = chromeState.bridge,
          let vc = bridge.viewController else { return }
    vc.sendToWebView([
      "id": NSNull(),
      "type": "event",
      "event": name,
      "data": data,
    ])
  }
}

extension View {
  func nativiteSheets(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteSheetModifier(chromeState: chromeState))
  }

  func nativiteAlerts(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteAlertModifier(chromeState: chromeState))
  }
}

// ─── iOS Title Bar + Toolbar (SwiftUI) ──────────────────────────────────────
// These modifiers render the navigation bar and bottom toolbar entirely in
// SwiftUI, replacing the UIKit UINavigationItem / UIToolbar code path.
// Applied inside a NavigationStack in NativiteRootView.

#if os(iOS)

extension NativiteChromeState.LargeTitleMode {
  var displayMode: NavigationBarItem.TitleDisplayMode {
    switch self {
    case .large: return .large
    case .inline: return .inline
    case .automatic: return .automatic
    }
  }
}

// ── NativiteBarButton ──────────────────────────────────────────────────────
// Reusable SwiftUI view that renders a single bar item — handles plain
// buttons, buttons with menus, nested sub-menus, icons, badges, destructive
// style, and disabled state.

struct NativiteBarButton: View {
  let item: NativiteChromeState.BarItemState
  let eventName: String
  var menuEventName: String = "titleBar.menuItemPressed"
  var onEvent: ((String, [String: Any]) -> Void)?

  var body: some View {
    Group {
      if let menu = item.menu {
        Menu { menuContent(menu) } label: { styledLabel }
          .disabled(item.disabled)
      } else {
        Button { onEvent?(eventName, ["id": item.id]) } label: { styledLabel }
          .disabled(item.disabled)
      }
    }
    .tint(item.resolvedTint)
  }

  @ViewBuilder private var styledLabel: some View {
    label
      .fontWeight(item.style == .primary ? .semibold : .regular)
  }

  @ViewBuilder private var label: some View {
    if let icon = item.icon {
      if let badge = item.badge {
        Image(systemName: icon)
          .overlay(alignment: .topTrailing) {
            Text(badge)
              .font(.caption2)
              .padding(.horizontal, 4)
              .padding(.vertical, 1)
              .background(.red)
              .foregroundStyle(.white)
              .clipShape(Capsule())
              .offset(x: 8, y: -6)
          }
      } else {
        Image(systemName: icon)
      }
    } else {
      Text(item.label ?? "")
    }
  }

  @ViewBuilder private func menuContent(_ menu: NativiteChromeState.MenuState) -> some View {
    ForEach(menu.items) { menuItem in
      if let children = menuItem.children, !children.isEmpty {
        Menu(menuItem.label) {
          ForEach(children) { child in
            menuLeaf(child)
          }
        }
      } else {
        menuLeaf(menuItem)
      }
    }
  }

  @ViewBuilder private func menuLeaf(_ menuItem: NativiteChromeState.MenuItemState) -> some View {
    Button(role: menuItem.style == .destructive ? .destructive : nil) {
      onEvent?(menuEventName, ["id": menuItem.id])
    } label: {
      if let icon = menuItem.icon {
        Label(menuItem.label, systemImage: icon)
      } else {
        Text(menuItem.label)
      }
    }
    .disabled(menuItem.disabled)
  }
}

// ── NativiteTitleBarModifier ──────────────────────────────────────────────
// SwiftUI ViewModifier applied inside NavigationStack — drives the
// navigation bar title, large-title mode, visibility, and bar button items.

struct NativiteTitleBarModifier: ViewModifier {
  var chromeState: NativiteChromeState

  func body(content: Content) -> some View {
    content
      .navigationTitle(chromeState.titleBarTitle)
      .navigationBarTitleDisplayMode(chromeState.titleBarLargeTitleMode.displayMode)
      .toolbar(chromeState.titleBarHidden ? .hidden : .visible, for: .navigationBar)
      .toolbar {
        ToolbarItemGroup(placement: .topBarLeading) {
          ForEach(chromeState.titleBarLeadingItems) { item in
            NativiteBarButton(
              item: item,
              eventName: "titleBar.leadingItemPressed",
              onEvent: chromeState.onChromeEvent
            )
          }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
          ForEach(chromeState.titleBarTrailingItems) { item in
            NativiteBarButton(
              item: item,
              eventName: "titleBar.trailingItemPressed",
              onEvent: chromeState.onChromeEvent
            )
          }
        }
      }
      .tint(chromeState.titleBarTint.map { Color(uiColor: UIColor(hex: $0)) })
      .if(chromeState.searchBar != nil) { view in
        view.searchable(
          text: Binding(
            get: { chromeState.searchBar?.value ?? "" },
            set: { newValue in
              chromeState.searchBar?.value = newValue
              chromeState.onChromeEvent?("titleBar.searchChanged", ["value": newValue])
            }
          ),
          prompt: chromeState.searchBar?.placeholder ?? "Search"
        )
        .onSubmit(of: .search) {
          chromeState.onChromeEvent?("titleBar.searchSubmitted",
            ["value": chromeState.searchBar?.value ?? ""])
        }
      }
  }
}

// ── NativiteToolbarModifier ──────────────────────────────────────────────
// SwiftUI ViewModifier for the bottom toolbar — renders bar items
// including flexible/fixed spacers.

struct NativiteToolbarModifier: ViewModifier {
  var chromeState: NativiteChromeState

  func body(content: Content) -> some View {
    content
      .toolbar(chromeState.toolbarHidden ? .hidden : .visible, for: .bottomBar)
      .toolbar {
        ToolbarItemGroup(placement: .bottomBar) {
          ForEach(chromeState.toolbarItems) { item in
            switch item.itemType {
            case .flexibleSpace:
              Spacer()
            case .fixedSpace:
              Spacer().frame(width: 8)
            case .button:
              NativiteBarButton(
                item: item,
                eventName: "toolbar.itemPressed",
                menuEventName: "toolbar.menuItemPressed",
                onEvent: chromeState.onChromeEvent
              )
            }
          }
        }
      }
  }
}

// ── Conditional modifier helper ─────────────────────────────────────────
// Applies a transform only when the condition is true. Used by the search
// bar integration to avoid changing SwiftUI view identity when search is nil.

extension View {
  @ViewBuilder
  func \`if\`<Transform: View>(_ condition: Bool, transform: (Self) -> Transform) -> some View {
    if condition {
      transform(self)
    } else {
      self
    }
  }
}

extension View {
  func nativiteTitleBar(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteTitleBarModifier(chromeState: chromeState))
  }

  func nativiteToolbar(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteToolbarModifier(chromeState: chromeState))
  }
}
#endif

#if os(macOS)

private extension NativiteChromeState.BarItemState {
  var resolvedTint: Color? {
    if let tint { return Color(nsColor: NSColor(hex: tint)) }
    if style == .destructive { return .red }
    return nil
  }
}

private func nativiteResolveChildURL(_ rawURL: String?, relativeTo baseURL: URL?) -> URL? {
  guard let rawURL else { return nil }
  if let url = URL(string: rawURL), url.scheme != nil {
    return url
  }
  guard let baseURL else { return nil }
  return URL(string: rawURL, relativeTo: baseURL)
}

struct NativiteMacBarButton: View {
  let item: NativiteChromeState.BarItemState
  let eventName: String
  var menuEventName: String = "titleBar.menuItemPressed"
  var onEvent: ((String, [String: Any]) -> Void)?
  var displayMode: NativiteChromeState.ToolbarDisplayMode = .iconAndLabel

  var body: some View {
    Group {
      if let menu = item.menu {
        Menu { menuContent(menu) } label: { styledLabel }
          .disabled(item.disabled)
      } else {
        Button { onEvent?(eventName, ["id": item.id]) } label: { styledLabel }
          .disabled(item.disabled)
      }
    }
    .tint(item.resolvedTint)
  }

  @ViewBuilder private var styledLabel: some View {
    label
      .fontWeight(item.style == .primary ? .semibold : .regular)
  }

  @ViewBuilder private var label: some View {
    switch displayMode {
    case .iconOnly:
      if let icon = item.icon {
        badgedIcon(icon)
      } else {
        Text(item.label ?? "")
      }
    case .labelOnly:
      Text(item.label ?? item.id)
    case .iconAndLabel:
      if let icon = item.icon {
        if let label = item.label {
          Label {
            Text(label)
          } icon: {
            badgedIcon(icon)
          }
        } else {
          badgedIcon(icon)
        }
      } else {
        Text(item.label ?? "")
      }
    }
  }

  @ViewBuilder private func badgedIcon(_ icon: String) -> some View {
    if let badge = item.badge {
      Image(systemName: icon)
        .overlay(alignment: .topTrailing) {
          Text(badge)
            .font(.caption2)
            .padding(.horizontal, 4)
            .padding(.vertical, 1)
            .background(.red)
            .foregroundStyle(.white)
            .clipShape(Capsule())
            .offset(x: 8, y: -6)
        }
    } else {
      Image(systemName: icon)
    }
  }

  @ViewBuilder private func menuContent(_ menu: NativiteChromeState.MenuState) -> some View {
    ForEach(menu.items) { menuItem in
      if let children = menuItem.children, !children.isEmpty {
        Menu(menuItem.label) {
          ForEach(children) { child in
            menuLeaf(child)
          }
        }
      } else {
        menuLeaf(menuItem)
      }
    }
  }

  @ViewBuilder private func menuLeaf(_ menuItem: NativiteChromeState.MenuItemState) -> some View {
    Button(role: menuItem.style == .destructive ? .destructive : nil) {
      onEvent?(menuEventName, ["id": menuItem.id])
    } label: {
      if let icon = menuItem.icon {
        Label(menuItem.label, systemImage: icon)
      } else {
        Text(menuItem.label)
      }
    }
    .disabled(menuItem.disabled)
  }
}

struct NativiteMacTitleBarModifier: ViewModifier {
  var chromeState: NativiteChromeState

  func body(content: Content) -> some View {
    let withToolbar = content.toolbar {
      if !chromeState.titleBarHidden {
        // Hidden text inside the navigation group guarantees the
        // NSToolbar always materialises (keeping the unified title
        // bar height consistent) and prevents the ambiguous-size
        // warning that empty ForEach would otherwise produce. The
        // actual title is rendered by AppKit via window.title
        // (always centred, no liquid glass).
        ToolbarItemGroup(placement: .navigation) {
          Text(" ").hidden()
          ForEach(chromeState.titleBarLeadingItems) { item in
            NativiteMacBarButton(
              item: item,
              eventName: "titleBar.leadingItemPressed",
              onEvent: chromeState.onChromeEvent
            )
          }
        }
        if !chromeState.titleBarTrailingItems.isEmpty {
          ToolbarItemGroup(placement: .primaryAction) {
            ForEach(chromeState.titleBarTrailingItems) { item in
              NativiteMacBarButton(
                item: item,
                eventName: "titleBar.trailingItemPressed",
                onEvent: chromeState.onChromeEvent
              )
            }
          }
        }
      }
    }
    let withTint = applyTint(to: withToolbar)
    applySearch(to: withTint)
  }

  @ViewBuilder
  private func applyTint<V: View>(to view: V) -> some View {
    if let tint = chromeState.titleBarTint {
      view.tint(Color(nsColor: NSColor(hex: tint)))
    } else {
      view
    }
  }

  @ViewBuilder
  private func applySearch<V: View>(to view: V) -> some View {
    if chromeState.searchBar != nil && !chromeState.titleBarHidden {
      view.searchable(
        text: Binding(
          get: { chromeState.searchBar?.value ?? "" },
          set: { newValue in
            chromeState.searchBar?.value = newValue
            chromeState.onChromeEvent?("titleBar.searchChanged", ["value": newValue])
          }
        ),
        isPresented: Binding(
          get: { chromeState.searchBar?.cancelButtonVisible ?? false },
          set: { isPresented in
            chromeState.searchBar?.cancelButtonVisible = isPresented
            if !isPresented {
              chromeState.onChromeEvent?("titleBar.searchCancelled", [:])
            }
          }
        ),
        placement: .toolbar,
        prompt: chromeState.searchBar?.placeholder ?? "Search"
      )
      .onSubmit(of: .search) {
        chromeState.onChromeEvent?("titleBar.searchSubmitted",
          ["value": chromeState.searchBar?.value ?? ""])
      }
    } else {
      view
    }
  }
}

struct NativiteMacToolbarModifier: ViewModifier {
  var chromeState: NativiteChromeState

  func body(content: Content) -> some View {
    if chromeState.toolbarHidden {
      content
    } else if !chromeState.toolbarGroups.isEmpty {
      applyGroupedToolbar(to: content)
    } else if !chromeState.toolbarItems.isEmpty {
      applyFlatToolbar(to: content)
    } else {
      content
    }
  }

  // Flat items mode (backward compatible) — no customisation
  @ViewBuilder
  private func applyFlatToolbar<V: View>(to view: V) -> some View {
    view.toolbar {
      ToolbarItemGroup(placement: .automatic) {
        ForEach(chromeState.toolbarItems) { item in
          toolbarButton(item)
        }
      }
    }
  }

  // Groups mode — supports placement + optional customisation
  @ViewBuilder
  private func applyGroupedToolbar<V: View>(to view: V) -> some View {
    if chromeState.toolbarCustomizable, let toolbarId = chromeState.toolbarId {
      view.toolbar(id: toolbarId) {
        customizableContent()
      }
    } else {
      view.toolbar {
        nonCustomizableContent()
      }
    }
  }

  @ToolbarContentBuilder
  private func nonCustomizableContent() -> some ToolbarContent {
    toolbarGroupContent(for: .automatic)
    toolbarGroupContent(for: .principal)
    toolbarGroupContent(for: .secondaryAction)
    toolbarGroupContent(for: .navigation)
    toolbarGroupContent(for: .primaryAction)
  }

  @ToolbarContentBuilder
  private func toolbarGroupContent(
    for placement: NativiteChromeState.ToolbarPlacement
  ) -> some ToolbarContent {
    let items = groupedToolbarItems(for: placement)
    if !items.isEmpty {
      ToolbarItemGroup(placement: swiftUIPlacement(placement)) {
        ForEach(items) { item in
          toolbarButton(item)
        }
      }
    }
  }

  @ToolbarContentBuilder
  private func customizableContent() -> some CustomizableToolbarContent {
    customizableToolbarContent(for: .automatic)
    customizableToolbarContent(for: .principal)
    customizableToolbarContent(for: .secondaryAction)
    customizableToolbarContent(for: .navigation)
    customizableToolbarContent(for: .primaryAction)
  }

  @ToolbarContentBuilder
  private func customizableToolbarContent(
    for placement: NativiteChromeState.ToolbarPlacement
  ) -> some CustomizableToolbarContent {
    let items = groupedToolbarItems(for: placement).filter { $0.customization != .hidden }
    if !items.isEmpty {
      ToolbarItem(
        id: "nativite.toolbar.\\(placement.rawValue)",
        placement: swiftUIPlacement(placement)
      ) {
        HStack(spacing: 8) {
          ForEach(items) { item in
            toolbarButton(item)
          }
        }
      }
      .customizationBehavior(swiftUICustomization(for: items))
    }
  }

  private func groupedToolbarItems(
    for placement: NativiteChromeState.ToolbarPlacement
  ) -> [NativiteChromeState.BarItemState] {
    chromeState.toolbarGroups
      .filter { $0.placement == placement }
      .flatMap(\\.items)
  }

  private func swiftUIPlacement(
    _ p: NativiteChromeState.ToolbarPlacement
  ) -> ToolbarItemPlacement {
    switch p {
    case .automatic:       return .automatic
    case .principal:       return .principal
    case .secondaryAction: return .secondaryAction
    case .navigation:      return .navigation
    case .primaryAction:   return .primaryAction
    }
  }

  private func swiftUICustomization(
    for items: [NativiteChromeState.BarItemState]
  ) -> ToolbarCustomizationBehavior {
    if !items.isEmpty && items.allSatisfy({ $0.customization == .required }) {
      return .disabled
    }
    return .default
  }

  @ViewBuilder
  private func toolbarButton(_ item: NativiteChromeState.BarItemState) -> some View {
    switch item.itemType {
    case .flexibleSpace:
      Spacer()
    case .fixedSpace:
      Spacer().frame(width: 8)
    case .button:
      NativiteMacBarButton(
        item: item,
        eventName: "toolbar.itemPressed",
        menuEventName: "toolbar.menuItemPressed",
        onEvent: chromeState.onChromeEvent,
        displayMode: chromeState.toolbarDisplayMode
      )
    }
  }
}

struct NativiteMacNavigationModifier: ViewModifier {
  @Bindable var chromeState: NativiteChromeState

  private var visibleItems: [NativiteChromeState.NavigationItemState] {
    chromeState.navigationItems.filter { !$0.hidden && $0.role != "search" }
  }

  private var showsTabs: Bool {
    if chromeState.navigationHidden { return false }
    if chromeState.navigationStyle == "sidebar" { return false }
    return !visibleItems.isEmpty
  }

  private var activeItemBinding: Binding<String> {
    Binding(
      get: {
        if let current = chromeState.navigationActiveItem, !current.isEmpty {
          return current
        }
        return visibleItems.first?.id ?? ""
      },
      set: { newValue in
        guard !newValue.isEmpty else { return }
        chromeState.navigationActiveItem = newValue
        chromeState.onChromeEvent?("navigation.itemPressed", ["id": newValue])
      }
    )
  }

  func body(content: Content) -> some View {
    content.safeAreaInset(edge: .top, spacing: 0) {
      if showsTabs {
        Picker("", selection: activeItemBinding) {
          ForEach(visibleItems) { item in
            if let icon = item.icon {
              Label(item.label, systemImage: icon).tag(item.id)
            } else {
              Text(item.label).tag(item.id)
            }
          }
        }
        .labelsHidden()
        .pickerStyle(.segmented)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
      }
    }
  }
}

struct NativiteMacSidebarModifier: ViewModifier {
  @Bindable var chromeState: NativiteChromeState

  private var showsSidebar: Bool {
    if chromeState.navigationStyle != "sidebar" { return false }
    if chromeState.navigationHidden { return false }
    return !chromeState.sidebarItems.isEmpty
  }

  private var sidebarSelection: Binding<String?> {
    Binding(
      get: { chromeState.sidebarActiveItem },
      set: { newValue in
        chromeState.sidebarActiveItem = newValue
        if let id = newValue {
          chromeState.onChromeEvent?("sidebarPanel.itemPressed", ["id": id])
        }
      }
    )
  }

  private var sidebarVisibility: Binding<NavigationSplitViewVisibility> {
    Binding(
      get: {
        if !chromeState.sidebarVisible || chromeState.sidebarCollapsed {
          return .detailOnly
        }
        return .all
      },
      set: { newValue in
        switch newValue {
        case .detailOnly:
          chromeState.sidebarCollapsed = true
          chromeState.sidebarVisible = false
        default:
          chromeState.sidebarCollapsed = false
          chromeState.sidebarVisible = true
        }
      }
    )
  }

  func body(content: Content) -> some View {
    Group {
      if showsSidebar {
        NavigationSplitView(columnVisibility: sidebarVisibility) {
          List(selection: sidebarSelection) {
            OutlineGroup(chromeState.sidebarItems, children: \\.children) { item in
              if let icon = item.icon {
                Label(item.label, systemImage: icon)
                  .tag(Optional(item.id))
              } else {
                Text(item.label)
                  .tag(Optional(item.id))
              }
            }
          }
          .navigationSplitViewColumnWidth(
            min: 180,
            ideal: chromeState.sidebarWidth ?? 220,
            max: 420
          )
          .navigationTitle(chromeState.sidebarTitle ?? "")
          .listStyle(.sidebar)
        } detail: {
          content
        }
      } else {
        content
      }
    }
  }
}

struct NativiteMacDrawersModifier: ViewModifier {
  @Bindable var chromeState: NativiteChromeState

  private var presentedDrawers: [NativiteChromeState.DrawerState] {
    chromeState.drawers.values
      .filter { $0.presented }
      .sorted { $0.id < $1.id }
  }

  private func drawer(for edge: NativiteChromeState.DrawerEdge) -> NativiteChromeState.DrawerState? {
    presentedDrawers.first(where: { $0.edge == edge })
  }

  func body(content: Content) -> some View {
    content
      .overlay(alignment: .leading) {
        if let drawer = drawer(for: .leading) {
          drawerView(drawer)
        }
      }
      .overlay(alignment: .trailing) {
        if let drawer = drawer(for: .trailing) {
          drawerView(drawer)
        }
      }
  }

  @ViewBuilder
  private func drawerView(_ drawer: NativiteChromeState.DrawerState) -> some View {
    let resolvedURL = nativiteResolveChildURL(drawer.url, relativeTo: chromeState.primaryWebView?.url)
    NativiteChildWebView(
      instanceName: drawer.id,
      url: resolvedURL,
      baseURL: chromeState.primaryWebView?.url,
      bridge: chromeState.bridge,
      chromeState: chromeState,
      backgroundColor: drawer.backgroundColor
    )
    .frame(width: drawer.width)
    .background {
      if let color = drawer.backgroundColor {
        Color(nsColor: NSColor(hex: color))
      }
    }
    .overlay(alignment: drawer.edge == .leading ? .trailing : .leading) {
      Divider()
    }
    .onAppear {
      chromeState.onChromeEvent?("drawer.presented", ["name": drawer.id])
    }
    .onDisappear {
      chromeState.onChromeEvent?("drawer.dismissed", ["name": drawer.id])
    }
  }
}

struct NativiteMacPopoversModifier: ViewModifier {
  @Bindable var chromeState: NativiteChromeState
  @State private var presentedPopoverName: String?

  private var activePopover: NativiteChromeState.PopoverState? {
    chromeState.popovers.values
      .filter { $0.presented }
      .sorted { $0.id < $1.id }
      .first
  }

  private var isPresented: Binding<Bool> {
    Binding(
      get: { activePopover != nil },
      set: { newValue in
        guard !newValue else { return }
        if let name = presentedPopoverName ?? activePopover?.id {
          chromeState.popovers[name]?.presented = false
          chromeState.onChromeEvent?("popover.dismissed", ["name": name])
        }
        presentedPopoverName = nil
      }
    )
  }

  func body(content: Content) -> some View {
    content
      .popover(isPresented: isPresented, attachmentAnchor: .rect(.bounds), arrowEdge: .top) {
        if let popover = activePopover {
          let resolvedURL = nativiteResolveChildURL(popover.url, relativeTo: chromeState.primaryWebView?.url)
          NativiteChildWebView(
            instanceName: popover.id,
            url: resolvedURL,
            baseURL: chromeState.primaryWebView?.url,
            bridge: chromeState.bridge,
            chromeState: chromeState,
            backgroundColor: popover.backgroundColor
          )
          .frame(width: popover.width, height: popover.height)
          .onAppear {
            presentedPopoverName = popover.id
            chromeState.onChromeEvent?("popover.presented", ["name": popover.id])
          }
        }
      }
      .onChange(of: activePopover?.id) { _, newValue in
        if let id = newValue {
          presentedPopoverName = id
        }
      }
  }
}

struct NativiteMacAppWindowsModifier: ViewModifier {
  @Bindable var chromeState: NativiteChromeState
  @State private var presentedAppWindowName: String?

  private var activeAppWindow: NativiteChromeState.AppWindowState? {
    chromeState.appWindows.values
      .filter { $0.presented }
      .sorted { $0.id < $1.id }
      .first
  }

  private var activeAppWindowBinding: Binding<NativiteChromeState.AppWindowState?> {
    Binding(
      get: { activeAppWindow },
      set: { newValue in
        if newValue == nil {
          for key in chromeState.appWindows.keys {
            chromeState.appWindows[key]?.presented = false
          }
        }
      }
    )
  }

  func body(content: Content) -> some View {
    content
      .sheet(item: activeAppWindowBinding, onDismiss: {
        if let name = presentedAppWindowName {
          chromeState.appWindows[name]?.presented = false
          chromeState.onChromeEvent?("appWindow.dismissed", ["name": name])
          presentedAppWindowName = nil
        }
      }) { appWindow in
        let resolvedURL = nativiteResolveChildURL(appWindow.url, relativeTo: chromeState.primaryWebView?.url)
        NativiteChildWebView(
          instanceName: appWindow.id,
          url: resolvedURL,
          baseURL: chromeState.primaryWebView?.url,
          bridge: chromeState.bridge,
          chromeState: chromeState,
          backgroundColor: appWindow.backgroundColor
        )
        .frame(width: appWindow.width, height: appWindow.height)
        .onAppear {
          presentedAppWindowName = appWindow.id
          chromeState.onChromeEvent?("appWindow.presented", ["name": appWindow.id])
        }
      }
      .onChange(of: activeAppWindow?.id) { _, newValue in
        if let id = newValue {
          presentedAppWindowName = id
        }
      }
  }
}

struct NativiteMenuBarCommands: Commands {
  var chromeState: NativiteChromeState

  var body: some Commands {
    CommandMenu("Nativite") {
      ForEach(chromeState.menuBarMenus) { menu in
        Menu(menu.title) {
          menuItems(menu.items)
        }
      }
    }
  }

  private func menuItems(_ items: [NativiteChromeState.MenuItemState]) -> AnyView {
    AnyView(
      ForEach(items) { item in
        if let children = item.children, !children.isEmpty {
          Menu(item.label) {
            menuItems(children)
          }
        } else {
          menuButton(item)
        }
      }
    )
  }

  private func menuButton(_ item: NativiteChromeState.MenuItemState) -> AnyView {
    if let key = keyEquivalent(from: item.keyEquivalent) {
      return AnyView(
        Button(role: item.style == .destructive ? .destructive : nil) {
          chromeState.onChromeEvent?("menuBar.itemPressed", ["id": item.id])
        } label: {
          menuButtonLabel(for: item)
        }
        .keyboardShortcut(key, modifiers: .command)
        .disabled(item.disabled)
      )
    }

    return AnyView(
      Button(role: item.style == .destructive ? .destructive : nil) {
        chromeState.onChromeEvent?("menuBar.itemPressed", ["id": item.id])
      } label: {
        menuButtonLabel(for: item)
      }
      .disabled(item.disabled)
    )
  }

  @ViewBuilder
  private func menuButtonLabel(for item: NativiteChromeState.MenuItemState) -> some View {
    if item.checked {
      Label(item.label, systemImage: "checkmark")
    } else if let icon = item.icon {
      Label(item.label, systemImage: icon)
    } else {
      Text(item.label)
    }
  }

  private func keyEquivalent(from raw: String?) -> KeyEquivalent? {
    guard let raw, raw.count == 1, let scalar = raw.unicodeScalars.first else { return nil }
    return KeyEquivalent(Character(scalar))
  }
}

extension View {
  func nativiteMacTitleBar(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteMacTitleBarModifier(chromeState: chromeState))
  }

  func nativiteMacToolbar(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteMacToolbarModifier(chromeState: chromeState))
  }

  func nativiteMacNavigation(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteMacNavigationModifier(chromeState: chromeState))
  }

  func nativiteMacSidebar(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteMacSidebarModifier(chromeState: chromeState))
  }

  func nativiteMacDrawers(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteMacDrawersModifier(chromeState: chromeState))
  }

  func nativiteMacPopovers(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteMacPopoversModifier(chromeState: chromeState))
  }

  func nativiteMacAppWindows(chromeState: NativiteChromeState) -> some View {
    modifier(NativiteMacAppWindowsModifier(chromeState: chromeState))
  }
}
#endif

// ─── SwiftUI Alert Presentation ──────────────────────────────────────────────
// View modifier that presents JS alert/confirm/prompt dialogs via SwiftUI.

struct NativiteAlertModifier: ViewModifier {
  @Bindable var chromeState: NativiteChromeState
  @State private var promptText: String = ""

  func body(content: Content) -> some View {
    content
      .alert(
        chromeState.activeAlert?.message ?? "",
        isPresented: alertPresented
      ) {
        alertButtons
      } message: {
        if chromeState.activeAlert?.type == .prompt {
          TextField("", text: $promptText)
        }
      }
  }

  private var alertPresented: Binding<Bool> {
    Binding(
      get: { chromeState.activeAlert != nil },
      set: { isPresented in
        if !isPresented {
          // User dismissed without tapping a button — treat as cancel
          let alert = chromeState.activeAlert
          switch alert?.type {
          case .alert:
            alert?.completion?(.ok)
          case .confirm:
            alert?.completion?(.cancel)
          case .prompt:
            alert?.completion?(.text(nil))
          case .none:
            break
          }
          chromeState.dismissAlert()
        }
      }
    )
  }

  @ViewBuilder
  private var alertButtons: some View {
    switch chromeState.activeAlert?.type {
    case .alert:
      Button("OK") {
        chromeState.activeAlert?.completion?(.ok)
        chromeState.dismissAlert()
      }
    case .confirm:
      Button("Cancel", role: .cancel) {
        chromeState.activeAlert?.completion?(.cancel)
        chromeState.dismissAlert()
      }
      Button("OK") {
        chromeState.activeAlert?.completion?(.ok)
        chromeState.dismissAlert()
      }
    case .prompt:
      Button("Cancel", role: .cancel) {
        chromeState.activeAlert?.completion?(.text(nil))
        chromeState.dismissAlert()
      }
      Button("OK") {
        chromeState.activeAlert?.completion?(.text(promptText))
        chromeState.dismissAlert()
        promptText = ""
      }
    case .none:
      EmptyView()
    }
  }
}

// ─── UIColor hex convenience ────────────────────────────────────────────────
// Shared extension used by NativiteWebViewRepresentable to parse hex colour
// strings from JS configuration.

#if os(iOS)
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
}
#elseif os(macOS)
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
}
#endif
`;
}
