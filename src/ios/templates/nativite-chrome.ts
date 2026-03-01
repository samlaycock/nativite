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

/// A view that only intercepts touches on the UITabBar, passing all others
/// through to sibling views below (the WKWebView).
private class PassThroughView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let result = super.hitTest(point, with: event)
    guard let result else { return nil }
    // Pass through if the hit landed on this wrapper itself (empty space).
    if result === self { return nil }
    // Intercept if the hit target or any of its ancestors is a UIControl
    // (buttons, text fields, tab bar items, search fields, etc.).
    var current: UIView? = result
    while let v = current, v !== self {
      if v is UIControl { return result }
      current = v.superview
    }
    // Not a control — pass through to the web view below.
    return nil
  }
}

class NativiteChrome: NSObject {

  weak var viewController: ViewController?
  // NativiteVars receives geometry updates after each setState call so it can
  // keep --nk-nav-height, --nk-tab-height etc. in sync with the live UIKit state.
  weak var vars: NativiteVars?
  // NativiteKeyboard handles the input accessory bar and keyboard dismiss mode.
  weak var keyboard: NativiteKeyboard?
  // Self-managed tab bar — used on < iOS 18. Installed lazily into vc.view.
  private lazy var tabBar = UITabBar()
  /// iOS 18+ tab bar controller — used for UITab/UISearchTab support.
  /// Lazily created on the first applyNavigationModern call.
  private var tabBarController: UITabBarController?
  /// Pass-through wrapper installed into vc.view on the iOS 18+ path.
  private var tabBarWrapperView: PassThroughView?
  /// Stored search bar config applied when UISearchTab search activates.
  private var pendingSearchBarConfig: [String: Any]?
  /// True while the UISearchTab search session is active. Prevents
  /// applyNavigationModern from rebuilding tabs mid-search.
  private var isNavigationSearchActive = false
  private var tabBottomAccessoryVC: NativiteTabBottomAccessoryController?
  private var lastAppliedAreas: Set<String> = []
  /// Cache of bar button items keyed by "{position}:{id}" for identity-based
  /// reuse. Preserving the same UIBarButtonItem object reference lets UIKit
  /// animate transitions (and morph liquid-glass capsules on iOS 26+).
  private var barItemCache: [String: UIBarButtonItem] = [:]
  /// Suppresses animation on the very first applyState() call so
  /// defaultChrome renders instantly before the WebView has loaded.
  private var isInitialApply = true

  // ── Entry point ────────────────────────────────────────────────────────────

  func applyState(_ args: Any?) {
    guard let state = args as? [String: Any] else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      // Reset areas that were previously applied but are now absent.
      let currentAreas = Set(state.keys)
      for area in self.lastAppliedAreas.subtracting(currentAreas) {
        self.resetArea(area)
      }
      self.lastAppliedAreas = currentAreas

      if let titleBar = state["titleBar"] as? [String: Any] {
        self.applyTitleBar(titleBar)
      }
      if let navigation = state["navigation"] as? [String: Any] {
        self.applyNavigation(navigation)
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
      if let sheets = state["sheets"] as? [String: [String: Any]] {
        for (name, sheetState) in sheets {
          self.applySheet(name: name, state: sheetState)
        }
      }
      // keyboard key — forward to NativiteKeyboard when the key is present.
      // We pass the dict directly; NativiteKeyboard handles missing/null sub-keys.
      if let keyboardState = state["keyboard"] as? [String: Any] {
        self.keyboard?.applyState(keyboardState)
      }
      if let tabBottomAccessory = state["tabBottomAccessory"] as? [String: Any] {
        self.applyTabBottomAccessory(tabBottomAccessory)
      }

      // Push updated chrome geometry to CSS variables after all state is applied.
      self.pushVarUpdates()
      self.isInitialApply = false
    }
  }

  // Read live UIKit geometry and forward to NativiteVars.
  // Called from the main-thread DispatchQueue block in applyState(_:).
  private func pushVarUpdates() {
    guard let vc = viewController else { return }
    let navController  = vc.navigationController

    let navH  = navController.map  { $0.navigationBar.frame.height } ?? 0
    let navV  = navController.map  { !$0.isNavigationBarHidden       } ?? false
    let tabH: CGFloat
    let tabV: Bool
    if #available(iOS 18.0, *), let tbc = tabBarController {
      tabH = tbc.tabBar.frame.height
      tabV = !tbc.tabBar.isHidden
    } else {
      tabH = tabBar.superview != nil ? tabBar.frame.height : 0
      tabV = tabBar.superview != nil && !tabBar.isHidden
    }
    let toolH = navController.map  { $0.toolbar.frame.height          } ?? 0
    let toolV = navController.map  { !$0.isToolbarHidden              } ?? false

    vars?.updateChrome(
      navHeight:      navH,  navVisible:      navV,
      tabHeight:      tabH,  tabVisible:      tabV,
      toolbarHeight:  toolH, toolbarVisible:  toolV
    )
  }
${applyInitialStateMethod}
  // ── Title Bar ──────────────────────────────────────────────────────────────

  private func applyTitleBar(_ state: [String: Any]) {
    guard let vc = viewController,
          let navController = vc.navigationController else { return }

    let navItem = vc.navigationItem

    if let title = state["title"] as? String {
      if #available(iOS 26.0, *), !isInitialApply {
        UIView.animate(withDuration: 0.35) { navItem.title = title }
      } else {
        navItem.title = title
      }
    }
    if let subtitle = state["subtitle"] as? String {
      if #available(iOS 26.0, *), !isInitialApply {
        UIView.animate(withDuration: 0.35) { navItem.prompt = subtitle }
      } else {
        navItem.prompt = subtitle
      }
    }
    if let mode = state["largeTitleMode"] as? String {
      navController.navigationBar.prefersLargeTitles = true
      navItem.largeTitleDisplayMode = largeTitleDisplayMode(from: mode)
    } else {
      navController.navigationBar.prefersLargeTitles = false
      navItem.largeTitleDisplayMode = .automatic
    }
    if let backLabel = state["backLabel"] as? String {
      navItem.backButtonTitle = backLabel
    } else if state["backLabel"] is NSNull {
      navItem.backButtonTitle = ""
    }
    let navHidden = (state["hidden"] as? Bool) ?? false
    if navController.isNavigationBarHidden != navHidden {
      navController.setNavigationBarHidden(navHidden, animated: true)
    }
    if let leadingItems = state["leadingItems"] as? [[String: Any]] {
      let items = leadingItems.compactMap { toolbarItem($0, position: "left") }
      navItem.setLeftBarButtonItems(items, animated: !isInitialApply)
    }
    if let trailingItems = state["trailingItems"] as? [[String: Any]] {
      let items = trailingItems.compactMap { toolbarItem($0, position: "right") }
      navItem.setRightBarButtonItems(items, animated: !isInitialApply)
    }
    if let searchBarState = state["searchBar"] as? [String: Any] {
      applySearchBar(searchBarState, to: vc)
    }
  }

  private func largeTitleDisplayMode(from string: String) -> UINavigationItem.LargeTitleDisplayMode {
    switch string {
    case "large": return .always
    case "inline": return .never
    default: return .automatic
    }
  }

  private func barButtonItem(_ state: [String: Any], position: String) -> UIBarButtonItem? {
    guard let id = state["id"] as? String else { return nil }
    let cacheKey = "\\(position):\\(id)"

    let style: UIBarButtonItem.Style
    switch state["style"] as? String {
    case "primary": style = .done
    default: style = .plain
    }
    let isDestructive = (state["style"] as? String) == "destructive"
    let isEnabled = !((state["disabled"] as? Bool) ?? false)
    let image = (state["icon"] as? String).flatMap { UIImage(systemName: $0) }
    let label = state["label"] as? String

    guard image != nil || label != nil else { return nil }

    let menu: UIMenu?
    if #available(iOS 14.0, *) {
      if let menuState = state["menu"] as? [String: Any] {
        menu = barButtonMenu(menuState, position: position)
      } else {
        menu = nil
      }
    } else {
      menu = nil
    }

    let hasMenu = menu != nil

    // ── Reuse cached item ──────────────────────────────────────────────────
    // Preserving the same UIBarButtonItem object reference lets UIKit animate
    // transitions and morph liquid-glass capsules on iOS 26+.
    //
    // Items with menus are NEVER reused. Setting UIBarButtonItem.menu on a
    // cached item does not reliably re-wire the new UIAction handlers — the
    // old closures may be retained internally, causing events to silently
    // fail. Always recreate menu-bearing items so the UIBarButtonItem is
    // initialised with the fresh UIMenu from the start.
    if !hasMenu, let cached = barItemCache[cacheKey] {
      let cachedHasMenu: Bool
      if #available(iOS 14.0, *) { cachedHasMenu = cached.menu != nil }
      else { cachedHasMenu = false }

      if !cachedHasMenu {
        cached.image = image
        cached.title = label
        cached.style = style
        cached.tintColor = isDestructive ? .systemRed : nil
        cached.isEnabled = isEnabled
        return cached
      }
      // Cached item had a menu but new state does not — fall through.
    }

    // ── Create new item ────────────────────────────────────────────────────
    let item: UIBarButtonItem
    if let image {
      if #available(iOS 14.0, *), let menu {
        item = UIBarButtonItem(title: label, image: image, primaryAction: nil, menu: menu)
      } else {
        item = UIBarButtonItem(image: image, style: style, target: self, action: #selector(barButtonTapped(_:)))
      }
    } else if let label {
      if #available(iOS 14.0, *), let menu {
        item = UIBarButtonItem(title: label, image: nil, primaryAction: nil, menu: menu)
      } else {
        item = UIBarButtonItem(title: label, style: style, target: self, action: #selector(barButtonTapped(_:)))
      }
    } else {
      return nil
    }

    item.style = style
    if isDestructive { item.tintColor = .systemRed }
    item.accessibilityIdentifier = cacheKey
    item.isEnabled = isEnabled
    barItemCache[cacheKey] = item
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
    if let childrenStates = itemState["children"] as? [[String: Any]] {
      let menuLabel = itemState["label"] as? String ?? ""
      let menuImage = (itemState["icon"] as? String).flatMap { UIImage(systemName: $0) }
      let children = childrenStates.compactMap { barButtonMenuElement($0, position: position) }
      guard !children.isEmpty else { return nil }
      return UIMenu(title: menuLabel, image: menuImage, identifier: nil, options: [], children: children)
    }

    guard let id = itemState["id"] as? String,
          let label = itemState["label"] as? String else { return nil }

    let image = (itemState["icon"] as? String).flatMap { UIImage(systemName: $0) }
    var attributes = UIMenuElement.Attributes()
    if (itemState["disabled"] as? Bool) ?? false {
      attributes.insert(.disabled)
    }
    if (itemState["style"] as? String) == "destructive" {
      attributes.insert(.destructive)
    }
    let actionState: UIMenuElement.State = ((itemState["checked"] as? Bool) ?? false) ? .on : .off
    let eventName: String
    switch position {
    case "toolbar": eventName = "toolbar.menuItemPressed"
    default:        eventName = "titleBar.menuItemPressed"
    }

    return UIAction(
      title: label,
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
    let parts = identifier.split(separator: ":", maxSplits: 1).map(String.init)
    guard parts.count == 2 else { return }
    let position = parts[0]
    let id = parts[1]
    switch position {
    case "toolbar": sendEvent(name: "toolbar.itemPressed", data: ["id": id])
    case "right":   sendEvent(name: "titleBar.trailingItemPressed", data: ["id": id])
    default:        sendEvent(name: "titleBar.leadingItemPressed", data: ["id": id])
    }
  }

  // ── Navigation (Tab Bar) ───────────────────────────────────────────────────

  /// The ID of the navigation item with role "search", if any.
  private var navigationSearchItemId: String?
  /// Lazily created search controller for navigation search-role items.
  /// Attached to the ViewController's navigationItem when the search tab is tapped.
  /// Used only on the legacy (< iOS 18) path.
  private var navigationSearchController: UISearchController?
  /// Tracks the last non-search tab that was selected, so it can be
  /// restored when the user cancels the search.
  private var lastNonSearchTabId: String?

  private func applyNavigation(_ state: [String: Any]) {
    guard let vc = viewController else { return }
    if #available(iOS 18.0, *) {
      applyNavigationModern(state, vc: vc)
    } else {
      applyNavigationLegacy(state, vc: vc)
    }
  }

  // ── Navigation: Legacy Path (< iOS 18) ──────────────────────────────────

  private func applyNavigationLegacy(_ state: [String: Any], vc: ViewController) {
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

    navigationSearchItemId = nil

    if let items = state["items"] as? [[String: Any]] {
      tabBar.items = items.enumerated().compactMap { (index, itemState) -> UITabBarItem? in
        guard let label = itemState["label"] as? String else { return nil }
        let role = itemState["role"] as? String
        let id = itemState["id"] as? String

        // Track the search item ID for event routing.
        if role == "search", let id {
          self.navigationSearchItemId = id
        }

        let icon = (itemState["icon"] as? String).flatMap { UIImage(systemName: $0) }
        // Default to magnifying glass for search-role items when no icon is provided.
        let image = icon ?? (role == "search" ? UIImage(systemName: "magnifyingglass") : nil)
        let item = UITabBarItem(title: label, image: image, tag: index)
        item.accessibilityIdentifier = id
        if let badge = itemState["badge"] as? String {
          item.badgeValue = badge
        } else if let badge = itemState["badge"] as? Int {
          item.badgeValue = String(badge)
        } else if itemState["badge"] is NSNull {
          item.badgeValue = nil
        }
        return item
      }
    }

    if let activeId = state["activeItem"] as? String,
       let item = tabBar.items?.first(where: { $0.accessibilityIdentifier == activeId }) {
      tabBar.selectedItem = item
      if activeId != navigationSearchItemId {
        lastNonSearchTabId = activeId
      }
    }
    tabBar.isHidden = (state["hidden"] as? Bool) ?? false

    // Configure search controller for the search-role tab.
    if navigationSearchItemId != nil {
      if navigationSearchController == nil {
        let sc = UISearchController(searchResultsController: nil)
        sc.obscuresBackgroundDuringPresentation = false
        sc.searchBar.delegate = self
        navigationSearchController = sc
      }
      if let searchBarState = state["searchBar"] as? [String: Any] {
        let searchBar = navigationSearchController!.searchBar
        if let placeholder = searchBarState["placeholder"] as? String {
          searchBar.placeholder = placeholder
        }
        if let value = searchBarState["value"] as? String {
          searchBar.text = value
        }
        if let shows = searchBarState["cancelButtonVisible"] as? Bool {
          searchBar.showsCancelButton = shows
        }
      }
    } else {
      // No search-role item — tear down search controller if it was previously set.
      if navigationSearchController != nil {
        vc.navigationItem.searchController = nil
        navigationSearchController = nil
      }
    }
  }

  // ── Navigation: Modern Path (iOS 18+) ───────────────────────────────────
  // Uses UITabBarController with UITab/UISearchTab for native tab bar
  // behaviour, floating design on iOS 26+, and automatic sidebar adaptation.

  @available(iOS 18.0, *)
  private func applyNavigationModern(_ state: [String: Any], vc: ViewController) {
    // Lazily create UITabBarController and install into vc.view.
    if tabBarController == nil {
      let tbc = UITabBarController()
      tbc.delegate = self
      tbc.view.backgroundColor = .clear

      let wrapper = PassThroughView()
      wrapper.translatesAutoresizingMaskIntoConstraints = false
      wrapper.backgroundColor = .clear

      tbc.view.translatesAutoresizingMaskIntoConstraints = false
      wrapper.addSubview(tbc.view)
      NSLayoutConstraint.activate([
        tbc.view.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor),
        tbc.view.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor),
        tbc.view.topAnchor.constraint(equalTo: wrapper.topAnchor),
        tbc.view.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor),
      ])

      vc.addChild(tbc)
      vc.view.addSubview(wrapper)
      NSLayoutConstraint.activate([
        wrapper.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor),
        wrapper.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor),
        wrapper.topAnchor.constraint(equalTo: vc.view.topAnchor),
        wrapper.bottomAnchor.constraint(equalTo: vc.view.bottomAnchor),
      ])
      tbc.didMove(toParent: vc)

      tabBarController = tbc
      tabBarWrapperView = wrapper
    }

    guard let tbc = tabBarController else { return }

    // Don't rebuild tabs or change selection while the search session is
    // active — doing so cancels the search and causes focus loss.
    if isNavigationSearchActive {
      tbc.tabBar.isHidden = (state["hidden"] as? Bool) ?? false
      pendingSearchBarConfig = state["searchBar"] as? [String: Any]
      return
    }

    // Map NavigationConfig.style to UITabBarController.Mode.
    if let styleStr = state["style"] as? String {
      switch styleStr {
      case "tabs":    tbc.mode = .tabBar
      case "sidebar": tbc.mode = .tabSidebar
      default:        tbc.mode = .automatic
      }
    } else {
      tbc.mode = .automatic
    }

    // Build UITab/UISearchTab array from items.
    navigationSearchItemId = nil

    if let items = state["items"] as? [[String: Any]] {
      var tabs: [UITab] = []

      for itemState in items {
        guard let id = itemState["id"] as? String,
              let label = itemState["label"] as? String else { continue }

        let role = itemState["role"] as? String
        let icon = (itemState["icon"] as? String).flatMap { UIImage(systemName: $0) }
        let subtitle = itemState["subtitle"] as? String

        if role == "search" {
          navigationSearchItemId = id
          let searchImage = icon ?? UIImage(systemName: "magnifyingglass")
          let hasSearchBar = state["searchBar"] is [String: Any]
          let searchTab = UISearchTab(viewControllerProvider: { [weak self] _ in
            let placeholder = UIViewController()
            placeholder.view.backgroundColor = .clear
            if hasSearchBar {
              let sc = UISearchController(searchResultsController: nil)
              sc.obscuresBackgroundDuringPresentation = false
              sc.searchResultsUpdater = self
              sc.searchBar.delegate = self
              placeholder.navigationItem.searchController = sc
              let nav = UINavigationController(rootViewController: placeholder)
              nav.isNavigationBarHidden = true
              nav.view.backgroundColor = .clear
              return nav
            }
            return placeholder
          })
          searchTab.title = label
          searchTab.image = searchImage
          if let subtitle { searchTab.subtitle = subtitle }
          if #available(iOS 26.0, *), hasSearchBar {
            searchTab.automaticallyActivatesSearch = true
          }
          tabs.append(searchTab)
        } else {
          let tab = UITab(title: label, image: icon, identifier: id) { _ in
            let placeholder = UIViewController()
            placeholder.view.backgroundColor = .clear
            return placeholder
          }
          if let subtitle { tab.subtitle = subtitle }

          if let badge = itemState["badge"] as? String {
            tab.badgeValue = badge
          } else if let badge = itemState["badge"] as? Int {
            tab.badgeValue = String(badge)
          } else if itemState["badge"] is NSNull {
            tab.badgeValue = nil
          }

          tabs.append(tab)
        }
      }

      tbc.tabs = tabs
    }

    // Active item selection.
    if let activeId = state["activeItem"] as? String {
      let tab: UITab?
      if activeId == navigationSearchItemId {
        tab = tbc.tabs.first(where: { $0 is UISearchTab })
      } else {
        tab = tbc.tabs.first(where: { $0.identifier == activeId })
      }
      if let tab {
        tbc.selectedTab = tab
        if activeId != navigationSearchItemId {
          lastNonSearchTabId = activeId
        }
      }
    }

    // Hidden state.
    tbc.tabBar.isHidden = (state["hidden"] as? Bool) ?? false

    // Store search bar config for application when UISearchTab activates.
    pendingSearchBarConfig = state["searchBar"] as? [String: Any]
  }

  /// Returns true when the given search bar belongs to the navigation search
  /// controller (legacy path) or the UITabBarController's search (modern path).
  private func isNavigationSearchBar(_ searchBar: UISearchBar) -> Bool {
    if searchBar === navigationSearchController?.searchBar { return true }
    if #available(iOS 18.0, *), tabBarController != nil { return true }
    return false
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  private func applyToolbar(_ state: [String: Any]) {
    guard let vc = viewController,
          let navController = vc.navigationController else { return }

    let toolbarHidden = (state["hidden"] as? Bool) ?? false
    if navController.isToolbarHidden != toolbarHidden {
      navController.setToolbarHidden(toolbarHidden, animated: true)
    }
    if let items = state["items"] as? [[String: Any]] {
      let barItems = items.compactMap { toolbarItem($0) }
      vc.setToolbarItems(barItems, animated: !isInitialApply)
    }
  }

  private func toolbarItem(_ state: [String: Any], position: String = "toolbar") -> UIBarButtonItem? {
    switch state["type"] as? String {
    case "flexible-space":
      return UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
    case "fixed-space":
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
      switch style {
      case "light": vc.statusBarStyle = .lightContent
      case "dark":  vc.statusBarStyle = .darkContent
      default:      vc.statusBarStyle = .default
      }
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

  private func applySearchBar(_ state: [String: Any], to vc: ViewController) {
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
    if let value = state["value"] as? String {
      searchBar.text = value
    }
    if let shows = state["cancelButtonVisible"] as? Bool {
      searchBar.showsCancelButton = shows
    }
  }

  // ── Sheet ──────────────────────────────────────────────────────────────────

  private func applySheet(name: String, state: [String: Any]) {
    guard let vc = viewController else { return }

    let presented = state["presented"] as? Bool ?? false

    if presented {
      let sheetVC: NativiteSheetViewController
      let shouldPresent: Bool

      if let existing = vc.presentedViewController as? NativiteSheetViewController {
        sheetVC = existing
        sheetVC.bridge = self // re-set in case NativiteChrome was re-created
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
        if let activeDetent = state["activeDetent"] as? String {
          sheet.selectedDetentIdentifier = sheetDetentIdentifier(from: activeDetent)
        }
        sheet.prefersGrabberVisible = state["grabberVisible"] as? Bool ?? false
        // Prioritise embedded webview interaction over "drag anywhere to resize".
        sheet.prefersScrollingExpandsWhenScrolledToEdge = false
        if let radiusNumber = state["cornerRadius"] as? NSNumber {
          sheet.preferredCornerRadius = CGFloat(truncating: radiusNumber)
        }
        sheet.delegate = sheetVC
      }
      sheetVC.isModalInPresentation = !((state["dismissible"] as? Bool) ?? true)
      sheetVC.nativeBridge = vc.nativiteBridgeHandler()
      sheetVC.instanceName = name
      if let hex = state["backgroundColor"] as? String {
        sheetVC.view.backgroundColor = UIColor(hex: hex)
      }
      if let rawURL = state["url"] as? String {
        sheetVC.loadURL(rawURL, relativeTo: vc.webView.url)
      }
      if shouldPresent {
        vc.present(sheetVC, animated: true) { [weak self] in
          self?.sendEvent(name: "sheet.presented", data: ["name": name])
        }
      }
    } else {
      if vc.presentedViewController is NativiteSheetViewController {
        vc.dismiss(animated: true)
      }
    }
  }

  // ── Tab Bottom Accessory ────────────────────────────────────────────────

  private func applyTabBottomAccessory(_ state: [String: Any]) {
    guard let vc = viewController else { return }

    let presented = state["presented"] as? Bool ?? false

    if presented {
      let accessoryVC: NativiteTabBottomAccessoryController
      let shouldInstall: Bool

      if let existing = tabBottomAccessoryVC {
        accessoryVC = existing
        accessoryVC.bridge = self
        shouldInstall = false
      } else {
        let created = NativiteTabBottomAccessoryController()
        created.bridge = self
        accessoryVC = created
        shouldInstall = true
      }

      accessoryVC.nativeBridge = vc.nativiteBridgeHandler()
      if let hex = state["backgroundColor"] as? String {
        accessoryVC.view.backgroundColor = UIColor(hex: hex)
      }
      if let rawURL = state["url"] as? String {
        accessoryVC.loadURL(rawURL, relativeTo: vc.webView.url)
      }

      if shouldInstall {
        if #available(iOS 26.0, *), let tbc = tabBarController {
          // Use the native UITabAccessory API — the system provides liquid
          // glass styling, rounded capsule shape, and scroll-to-minimize.
          // Skip addChild/didMove — UITabAccessory places the view in the
          // tab bar controller's own hierarchy, not vc.view, so UIKit's
          // containment check would fail.
          let accessory = UITabAccessory(contentView: accessoryVC.view)
          tbc.setBottomAccessory(accessory, animated: true)
        } else {
          // Fallback: manually position above the tab bar.
          vc.addChild(accessoryVC)
          accessoryVC.view.translatesAutoresizingMaskIntoConstraints = false
          vc.view.addSubview(accessoryVC.view)

          let bottomAnchor: NSLayoutYAxisAnchor
          if #available(iOS 18.0, *), let tbc = tabBarController {
            bottomAnchor = tbc.tabBar.topAnchor
          } else if tabBar.superview != nil {
            bottomAnchor = tabBar.topAnchor
          } else {
            bottomAnchor = vc.view.safeAreaLayoutGuide.bottomAnchor
          }

          NSLayoutConstraint.activate([
            accessoryVC.view.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor),
            accessoryVC.view.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor),
            accessoryVC.view.bottomAnchor.constraint(equalTo: bottomAnchor),
            accessoryVC.view.heightAnchor.constraint(equalToConstant: 44),
          ])
          accessoryVC.didMove(toParent: vc)
        }

        tabBottomAccessoryVC = accessoryVC
        sendEvent(name: "tabBottomAccessory.presented", data: [:])
      }
    } else {
      if let accessoryVC = tabBottomAccessoryVC {
        if #available(iOS 26.0, *), let tbc = tabBarController {
          tbc.setBottomAccessory(nil, animated: true)
        } else {
          accessoryVC.willMove(toParent: nil)
          accessoryVC.view.removeFromSuperview()
          accessoryVC.removeFromParent()
        }
        tabBottomAccessoryVC = nil
        sendEvent(name: "tabBottomAccessory.dismissed", data: [:])
      }
    }
  }

  private func resetTabBottomAccessory() {
    if let accessoryVC = tabBottomAccessoryVC {
      if #available(iOS 26.0, *), let tbc = tabBarController {
        tbc.setBottomAccessory(nil, animated: false)
      } else {
        accessoryVC.willMove(toParent: nil)
        accessoryVC.view.removeFromSuperview()
        accessoryVC.removeFromParent()
      }
      tabBottomAccessoryVC = nil
    }
  }

  func postMessageToChild(name: String, payload: Any?) {
    if name == "tabBottomAccessory" {
      tabBottomAccessoryVC?.receiveMessage(from: "main", payload: payload)
      return
    }
    guard let sheetVC = viewController?.presentedViewController as? NativiteSheetViewController,
          sheetVC.instanceName == name else { return }
    sheetVC.receiveMessage(from: "main", payload: payload)
  }

  func broadcastMessage(from sender: String, payload: Any?) {
    // Forward to primary webview (via sendEvent) unless sender is "main"
    if sender != "main" {
      sendEvent(name: "message", data: ["from": sender, "payload": payload ?? NSNull()])
    }
    // Forward to all presented child webviews
    if let sheetVC = viewController?.presentedViewController as? NativiteSheetViewController {
      sheetVC.receiveMessage(from: sender, payload: payload)
    }
    tabBottomAccessoryVC?.receiveMessage(from: sender, payload: payload)
  }

  func instanceName(for webView: WKWebView?) -> String {
    guard let webView else { return "unknown" }
    if let sheetVC = viewController?.presentedViewController as? NativiteSheetViewController,
       sheetVC.webView === webView {
      return sheetVC.instanceName
    }
    if let accessoryVC = tabBottomAccessoryVC, accessoryVC.webView === webView {
      return "tabBottomAccessory"
    }
    return "unknown"
  }

  private func sheetDetent(from string: String) -> UISheetPresentationController.Detent? {
    switch string {
    case "small":  return smallDetent()
    case "medium": return .medium()
    case "large":  return .large()
    case "full":   return fullDetent()
    default:       return nil
    }
  }

  private func sheetDetentIdentifier(
    from string: String
  ) -> UISheetPresentationController.Detent.Identifier? {
    switch string {
    case "small":  return smallDetentIdentifier()
    case "medium": return .medium
    case "large":  return .large
    case "full":   return fullDetentIdentifier()
    default:       return nil
    }
  }

  private func fullDetent() -> UISheetPresentationController.Detent? {
    if #available(iOS 16.0, *) {
      return UISheetPresentationController.Detent.custom(
        identifier: UISheetPresentationController.Detent.Identifier("nativite.full")
      ) { context in
        context.maximumDetentValue
      }
    }
    return .large()
  }

  private func fullDetentIdentifier() -> UISheetPresentationController.Detent.Identifier? {
    if #available(iOS 16.0, *) {
      return UISheetPresentationController.Detent.Identifier("nativite.full")
    }
    return .large
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

  // ── Area cleanup ───────────────────────────────────────────────────────────

  private func resetArea(_ area: String) {
    switch area {
    case "titleBar":      resetTitleBar()
    case "navigation":    resetNavigation()
    case "toolbar":       resetToolbar()
    case "statusBar":     resetStatusBar()
    case "homeIndicator": resetHomeIndicator()
    case "sheets":                resetSheets()
    case "keyboard":              keyboard?.applyState(["accessory": NSNull()])
    case "tabBottomAccessory":    resetTabBottomAccessory()
    default: break
    }
  }

  private func resetTitleBar() {
    guard let vc = viewController,
          let navController = vc.navigationController else { return }
    let navItem = vc.navigationItem
    navItem.title = nil
    navItem.prompt = nil
    navItem.backButtonTitle = nil
    navItem.largeTitleDisplayMode = .automatic
    navController.navigationBar.prefersLargeTitles = false
    navItem.setLeftBarButtonItems(nil, animated: true)
    navItem.setRightBarButtonItems(nil, animated: true)
    navItem.searchController = nil
    navController.setNavigationBarHidden(true, animated: true)
    // Purge title-bar cache entries (left/right positions).
    barItemCache = barItemCache.filter { key, _ in
      !key.hasPrefix("left:") && !key.hasPrefix("right:")
    }
  }

  private func resetNavigation() {
    if #available(iOS 18.0, *) {
      if let tbc = tabBarController {
        tbc.willMove(toParent: nil)
        tbc.view.removeFromSuperview()
        tbc.removeFromParent()
        tabBarController = nil
      }
      tabBarWrapperView?.removeFromSuperview()
      tabBarWrapperView = nil
      pendingSearchBarConfig = nil
      isNavigationSearchActive = false
    }
    tabBar.isHidden = true
    navigationSearchItemId = nil
    navigationSearchController = nil
    lastNonSearchTabId = nil
  }

  private func resetToolbar() {
    guard let vc = viewController,
          let navController = vc.navigationController else { return }
    vc.setToolbarItems(nil, animated: true)
    navController.setToolbarHidden(true, animated: true)
    // Purge toolbar cache entries.
    barItemCache = barItemCache.filter { key, _ in !key.hasPrefix("toolbar:") }
  }

  private func resetStatusBar() {
    guard let vc = viewController else { return }
    vc.statusBarStyle = .default
    vc.statusBarHidden = false
    vc.setNeedsStatusBarAppearanceUpdate()
  }

  private func resetHomeIndicator() {
    guard let vc = viewController else { return }
    vc.homeIndicatorHidden = false
    vc.setNeedsUpdateOfHomeIndicatorAutoHidden()
  }

  private func resetSheets() {
    if viewController?.presentedViewController is NativiteSheetViewController {
      viewController?.dismiss(animated: true)
    }
  }
${sendEventMethod}
}

// ─── UITabBarDelegate ─────────────────────────────────────────────────────────

extension NativiteChrome: UITabBarDelegate {
  func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
    guard let id = item.accessibilityIdentifier else { return }

    if id == navigationSearchItemId {
      // Search-role tab tapped — attach the search controller to the
      // navigation item and activate it, mimicking UISearchTab behaviour.
      if let vc = viewController, let sc = navigationSearchController {
        vc.navigationItem.searchController = sc
        DispatchQueue.main.async { sc.isActive = true }
      }
    } else {
      // Track the last non-search tab for restoring on cancel.
      lastNonSearchTabId = id
    }

    sendEvent(name: "navigation.itemPressed", data: ["id": id])
  }
}

// ─── UITabBarControllerDelegate (iOS 18+) ─────────────────────────────────────

@available(iOS 18.0, *)
extension NativiteChrome: UITabBarControllerDelegate {
  func tabBarController(
    _ tabBarController: UITabBarController,
    didSelectTab selectedTab: UITab,
    previousTab: UITab?
  ) {
    let id: String
    if selectedTab is UISearchTab, let searchId = navigationSearchItemId {
      id = searchId
    } else {
      id = selectedTab.identifier
    }
    if id != navigationSearchItemId {
      lastNonSearchTabId = id
    }
    sendEvent(name: "navigation.itemPressed", data: ["id": id])
  }

  func tabBarController(
    _ tabBarController: UITabBarController,
    willBeginSearch searchController: UISearchController
  ) {
    isNavigationSearchActive = true
    searchController.searchResultsUpdater = self
    searchController.searchBar.delegate = self
    if let config = pendingSearchBarConfig {
      if let p = config["placeholder"] as? String {
        searchController.searchBar.placeholder = p
      }
      if let v = config["value"] as? String {
        searchController.searchBar.text = v
      }
      if let c = config["cancelButtonVisible"] as? Bool {
        searchController.searchBar.showsCancelButton = c
      }
    }
  }

  func tabBarController(
    _ tabBarController: UITabBarController,
    willEndSearch searchController: UISearchController
  ) {
    sendEvent(name: "navigation.searchCancelled", data: [:])
    // Defer state changes until after UIKit finishes its end-of-search
    // transition. Clearing isNavigationSearchActive or setting selectedTab
    // synchronously here conflicts with the in-progress transition.
    let prevId = lastNonSearchTabId
    DispatchQueue.main.async { [weak self, weak tabBarController] in
      self?.isNavigationSearchActive = false
      if let prevId,
         let tbc = tabBarController,
         let tab = tbc.tabs.first(where: { $0.identifier == prevId }) {
        tbc.selectedTab = tab
      }
    }
  }
}

// ─── UISearchBarDelegate (navigation search) ─────────────────────────────────

extension NativiteChrome: UISearchBarDelegate {
  func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
    guard isNavigationSearchBar(searchBar) else { return }
    sendEvent(name: "navigation.searchChanged", data: ["value": searchText])
  }

  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    guard isNavigationSearchBar(searchBar) else { return }
    sendEvent(name: "navigation.searchSubmitted", data: ["value": searchBar.text ?? ""])
  }

  func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
    guard isNavigationSearchBar(searchBar) else { return }
    // Legacy path: deactivate the search controller and restore the previous tab.
    navigationSearchController?.isActive = false
    viewController?.navigationItem.searchController = nil
    if let prevId = lastNonSearchTabId,
       let item = tabBar.items?.first(where: { $0.accessibilityIdentifier == prevId }) {
      tabBar.selectedItem = item
    }
    sendEvent(name: "navigation.searchCancelled", data: [:])
  }
}

// ─── UISearchResultsUpdating (iOS 18+ navigation search) ──────────────────────

extension NativiteChrome: UISearchResultsUpdating {
  func updateSearchResults(for searchController: UISearchController) {
    let text = searchController.searchBar.text ?? ""
    sendEvent(name: "navigation.searchChanged", data: ["value": text])
  }
}

// ─── Supporting: NativiteSheetViewController ─────────────────────────────────

private class NativiteSheetViewController: UIViewController,
  UISheetPresentationControllerDelegate,
  WKNavigationDelegate
{
  weak var bridge: NativiteChrome?
  weak var nativeBridge: NativiteBridge?
  // The name given to sheet("name", ...) on the JS side. Injected as
  // window.__nativekit_instance_name__ so the native message broker
  // can correctly route postToParent/broadcast calls from this webview.
  var instanceName: String = "sheet"
  private(set) var webView: NativiteWebView!
  private var lastLoadedURL: URL?
  private var pendingSPARoute: String?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let config = WKWebViewConfiguration()
    // Using WKWebsiteDataStore.default() ensures this webview shares the same
    // web process as the primary webview (iOS 15+), enabling shared storage
    // (localStorage, IndexedDB, cookies) across instances.
    config.websiteDataStore = WKWebsiteDataStore.default()
    let nkPlatform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
    config.applicationNameForUserAgent = "Nativite/\\(nkPlatform)/1.0"
    // Identify this webview by its configured name so the native message broker
    // can route postToParent/broadcast calls from this instance correctly.
    // Also set data-nk-platform on the document element so CSS attribute selectors
    // (e.g. [data-nk-platform="ios"]) work the same as in the primary webview.
    config.userContentController.addUserScript(WKUserScript(
      source: "window.__nativekit_instance_name__ = \\"\\(instanceName)\\";document.documentElement.setAttribute('data-nk-platform','\\(nkPlatform)');",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
    if let nativeBridge {
      config.userContentController.addScriptMessageHandler(nativeBridge, contentWorld: .page, name: "nativite")
    }

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

  func receiveMessage(from sender: String, payload: Any?) {
    loadViewIfNeeded()
    let data: [String: Any] = ["from": sender, "payload": payload ?? NSNull()]
    let message: [String: Any] = ["id": NSNull(), "type": "event", "event": "message", "data": data]
    guard JSONSerialization.isValidJSONObject(message),
      let msgData = try? JSONSerialization.data(withJSONObject: message),
      let json = String(data: msgData, encoding: .utf8)
    else { return }

    webView.evaluateJavaScript("window.nativiteReceive(\\(json))", completionHandler: nil)
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
      "name": instanceName,
      "message": nsError.localizedDescription,
      "code": nsError.code,
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
    } else if #available(iOS 16.0, *),
              controller.selectedDetentIdentifier == UISheetPresentationController.Detent.Identifier("nativite.full") {
      detent = "full"
    } else {
      switch controller.selectedDetentIdentifier {
      case .medium: detent = "medium"
      case .large:  detent = "large"
      default:      detent = "large"
      }
    }
    bridge?.sendEvent(name: "sheet.detentChanged", data: ["name": instanceName, "detent": detent])
  }

  // UIAdaptivePresentationControllerDelegate — fires only when the sheet is
  // actually dismissed (user swipe or programmatic dismiss), never when another
  // VC is merely presented on top of the sheet.  viewDidDisappear was wrong
  // because it fires for any view-disappearance (e.g. alert over the sheet).
  // UISheetPresentationControllerDelegate inherits UIAdaptivePresentationControllerDelegate,
  // and sheet.delegate = sheetVC is set in applySheet(), so UIKit routes this call correctly.
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    bridge?.sendEvent(name: "sheet.dismissed", data: ["name": instanceName])
  }
}

// ─── Tab Bottom Accessory Controller ──────────────────────────────────────────

private class NativiteTabBottomAccessoryController: UIViewController, WKNavigationDelegate {
  weak var bridge: NativiteChrome?
  weak var nativeBridge: NativiteBridge?
  private(set) var webView: NativiteWebView!
  private var lastLoadedURL: URL?
  private var pendingSPARoute: String?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let config = WKWebViewConfiguration()
    config.websiteDataStore = WKWebsiteDataStore.default()
    let nkPlatform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
    config.applicationNameForUserAgent = "Nativite/\\(nkPlatform)/1.0"
    config.userContentController.addUserScript(WKUserScript(
      source: "window.__nativekit_instance_name__ = \\"tabBottomAccessory\\";document.documentElement.setAttribute('data-nk-platform','\\(nkPlatform)');",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
    if let nativeBridge {
      config.userContentController.addScriptMessageHandler(nativeBridge, contentWorld: .page, name: "nativite")
    }

    webView = NativiteWebView(frame: view.bounds, configuration: config)
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    webView.lockRootScroll = false
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.isScrollEnabled = false
    webView.scrollView.bounces = false
    webView.scrollView.alwaysBounceVertical = false
    webView.scrollView.alwaysBounceHorizontal = false
    webView.navigationDelegate = self
    view.addSubview(webView)
  }

  deinit {
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "nativite")
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

  func receiveMessage(from sender: String, payload: Any?) {
    loadViewIfNeeded()
    let data: [String: Any] = ["from": sender, "payload": payload ?? NSNull()]
    let message: [String: Any] = ["id": NSNull(), "type": "event", "event": "message", "data": data]
    guard JSONSerialization.isValidJSONObject(message),
      let msgData = try? JSONSerialization.data(withJSONObject: message),
      let json = String(data: msgData, encoding: .utf8)
    else { return }

    webView.evaluateJavaScript("window.nativiteReceive(\\(json))", completionHandler: nil)
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
    ]
    if let failingURL {
      payload["url"] = failingURL
    }
    bridge?.sendEvent(name: "tabBottomAccessory.loadFailed", data: payload)
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
  private var lastAppliedAreas: Set<String> = []

  // ── Entry point ────────────────────────────────────────────────────────────

  func applyState(_ args: Any?) {
    guard let state = args as? [String: Any] else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      // Reset areas that were previously applied but are now absent.
      let currentAreas = Set(state.keys)
      for area in self.lastAppliedAreas.subtracting(currentAreas) {
        self.resetArea(area)
      }
      self.lastAppliedAreas = currentAreas

      if let titleBarState = state["titleBar"] as? [String: Any] {
        self.applyTitleBar(titleBarState)
      }
      if let menuBarState = state["menuBar"] as? [String: Any] {
        self.applyMenuBar(menuBarState)
      }
      if let sidebarPanelState = state["sidebarPanel"] as? [String: Any] {
        self.applySidebarPanel(sidebarPanelState)
      }

      // Silently ignore iOS-only keys: navigation, toolbar,
      // statusBar, homeIndicator, sheets, keyboard
    }
  }

  // iOS-only in this phase.
  func postMessageToChild(name: String, payload: Any?) { _ = name; _ = payload }
  func broadcastMessage(from sender: String, payload: Any?) { _ = sender; _ = payload }
  func instanceName(for webView: WKWebView?) -> String { _ = webView; return "unknown" }
${applyInitialStateMethod}
  // ── Title Bar (macOS window) ─────────────────────────────────────────────────

  private func applyTitleBar(_ state: [String: Any]) {
    guard let window = viewController?.view.window else { return }

    if let title = state["title"] as? String {
      window.title = title
    }
    if let subtitle = state["subtitle"] as? String {
      window.subtitle = subtitle
    }
    if let separator = state["separatorStyle"] as? String {
      switch separator {
      case "none":       window.titlebarSeparatorStyle = .none
      case "shadow":     window.titlebarSeparatorStyle = .shadow
      case "line":       window.titlebarSeparatorStyle = .line
      default:           window.titlebarSeparatorStyle = .automatic
      }
    }
    if let fullSizeContent = state["fullSizeContent"] as? Bool {
      if fullSizeContent {
        window.styleMask.insert(.fullSizeContentView)
        window.titlebarAppearsTransparent = true
      } else {
        window.styleMask.remove(.fullSizeContentView)
        window.titlebarAppearsTransparent = false
      }
    }
    if let hidden = state["hidden"] as? Bool {
      window.titleVisibility = hidden ? .hidden : .visible
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
      guard let label = menuState["label"] as? String else { continue }

      let submenu = NSMenu(title: label)
      let menuItem = NSMenuItem(title: label, action: nil, keyEquivalent: "")
      menuItem.submenu = submenu

      if let items = menuState["items"] as? [[String: Any]] {
        addMenuItems(items, to: submenu)
      }

      mainMenu.addItem(menuItem)
    }

    NSApp.mainMenu = mainMenu
  }

  private func addMenuItems(_ items: [[String: Any]], to menu: NSMenu) {
    for itemState in items {
      guard let itemLabel = itemState["label"] as? String,
            let itemId = itemState["id"] as? String else { continue }

      if let childrenStates = itemState["children"] as? [[String: Any]] {
        let submenu = NSMenu(title: itemLabel)
        addMenuItems(childrenStates, to: submenu)
        let subItem = NSMenuItem(title: itemLabel, action: nil, keyEquivalent: "")
        if let symbolName = itemState["icon"] as? String {
          subItem.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
        }
        subItem.submenu = submenu
        menu.addItem(subItem)
        continue
      }

      let keyEquiv = itemState["keyEquivalent"] as? String ?? ""
      let item = NSMenuItem(
        title: itemLabel,
        action: #selector(menuItemClicked(_:)),
        keyEquivalent: keyEquiv
      )
      item.target = self
      item.tag = menuActions.count
      menuActions[String(item.tag)] = itemId

      if (itemState["disabled"] as? Bool) ?? false {
        item.isEnabled = false
      }
      if (itemState["checked"] as? Bool) ?? false {
        item.state = .on
      }
      if (itemState["style"] as? String) == "destructive" {
        item.attributedTitle = NSAttributedString(
          string: itemLabel,
          attributes: [.foregroundColor: NSColor.systemRed]
        )
      }
      if let symbolName = itemState["icon"] as? String {
        item.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
      }

      menu.addItem(item)
    }
  }

  @objc private func menuItemClicked(_ sender: NSMenuItem) {
    guard let id = menuActions[String(sender.tag)] else { return }
    sendEvent(name: "menuBar.itemPressed", data: ["id": id])
  }

  // ── Sidebar Panel ────────────────────────────────────────────────────────────

  private func applySidebarPanel(_ state: [String: Any]) {
    guard let items = state["items"] as? [[String: Any]] else { return }

    // Fire a sidebarPanel.itemPressed event with the full item list so the JS
    // side can reconcile. The actual NSSplitViewController wiring is deferred to
    // a later phase — for now we emit the event so the bridge contract is honoured.
    var sidebarItems: [[String: Any]] = []
    for itemState in items {
      guard let id = itemState["id"] as? String,
            let label = itemState["label"] as? String else { continue }
      var item: [String: Any] = ["id": id, "label": label]
      if let symbolName = itemState["icon"] as? String {
        item["icon"] = symbolName
      }
      sidebarItems.append(item)
    }

    if let activeId = state["activeItem"] as? String {
      sendEvent(name: "sidebarPanel.itemPressed", data: ["id": activeId, "items": sidebarItems])
    }
  }

  // ── Area cleanup ───────────────────────────────────────────────────────────

  private func resetArea(_ area: String) {
    switch area {
    case "titleBar": resetTitleBar()
    case "menuBar":  resetMenuBar()
    default: break
    }
  }

  private func resetTitleBar() {
    guard let window = viewController?.view.window else { return }
    window.title = ""
    window.subtitle = ""
  }

  private func resetMenuBar() {
    NSApp.mainMenu = nil
    menuActions.removeAll()
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
