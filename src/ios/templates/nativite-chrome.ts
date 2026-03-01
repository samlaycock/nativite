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
  // Called from ViewController.viewDidLoad() when a defaultChrome config was
  // provided. Applies the initial chrome state before the WebView has loaded
  // so the native UI is correct from the very first frame.

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

// MARK: - NativiteChrome

/// Reconciles declarative "chrome" state from JavaScript onto UIKit.
///
/// The JS layer sends a full state snapshot via the "__chrome_set_state__"
/// bridge handler. applyState(_:) diffs that snapshot against the
/// previously-applied areas and maps each area key to the corresponding UIKit
/// API (UINavigationItem, UITabBarController, UIToolbar, etc.).
///
/// ## Ownership hierarchy
///
///     ViewController
///       └─ NativiteChrome  (this class)
///            ├─ UITabBarController   (iOS 18+ tabs)
///            ├─ UITabBar             (< iOS 18 legacy tabs)
///            ├─ NativiteSheetViewController  (child webview sheets)
///            └─ NativiteTabBottomAccessoryController
///
/// ## Threading
///
/// All UIKit work is dispatched to the main queue inside applyState(_:).
/// Public helpers like postMessageToChild(name:payload:) must be called
/// from the main thread.
private let nativiteSmallDetentIdentifier = UISheetPresentationController.Detent.Identifier("nativite.small")

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
  /// Stored search bar config applied when UISearchTab search activates.
  private var pendingSearchBarConfig: [String: Any]?
  /// True while the UISearchTab search session is active. Prevents
  /// applyNavigationModern from rebuilding tabs mid-search.
  private var isNavigationSearchActive = false
  /// Structural fingerprint of the current tabs — an array of
  /// "{id}:{role}" strings. Compared on each applyNavigationModern call
  /// to avoid rebuilding UITab objects when only mutable properties changed.
  private var tabFingerprint: [String] = []
  private var tabBottomAccessoryVC: NativiteTabBottomAccessoryController?
  private var lastAppliedAreas: Set<String> = []
  /// Cache of bar button items keyed by "{position}:{id}" for identity-based
  /// reuse. Preserving the same UIBarButtonItem object reference lets UIKit
  /// animate transitions (and morph liquid-glass capsules on iOS 26+).
  private var barItemCache: [String: UIBarButtonItem] = [:]
  /// Suppresses animation on the very first applyState() call so
  /// defaultChrome renders instantly before the WebView has loaded.
  private var isInitialApply = true
  /// Active Auto Layout constraints pinning the WKWebView into the
  /// selected tab's VC view. Tracked explicitly so they can be
  /// deactivated before new ones are activated, avoiding duplicates.
  private var webViewReparentConstraints: [NSLayoutConstraint] = []
  /// True while a deferred reparent is pending (DispatchQueue.main.async).
  /// Prevents duplicate dispatch when reparentWebView is called multiple
  /// times before UIKit has created the selected tab's VC.
  private var hasPendingReparent = false

  // ── Entry point ────────────────────────────────────────────────────────────

  /// Main entry point — called by the bridge when JS sends a new chrome state.
  ///
  /// The args dictionary is keyed by area name ("titleBar",
  /// "navigation", "toolbar", etc.). Each present key is forwarded to
  /// the corresponding apply... method. Areas that were present in the
  /// previous call but are now absent are reset to defaults.
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
      // Forward the keyboard config to NativiteKeyboard (input accessory bar,
      // dismiss mode). We pass the raw dict; NativiteKeyboard handles missing
      // or null sub-keys internally.
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

  /// Reads live UIKit geometry (nav bar, tab bar, toolbar heights and
  /// visibility) and forwards them to NativiteVars so the CSS custom
  /// properties (--nk-nav-height, --nk-tab-height, etc.) stay in
  /// sync with the current UIKit state.
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

  /// Applies the titleBar area — maps onto the UINavigationController's
  /// navigation bar (title, subtitle, large-title mode, bar button items,
  /// search bar, and visibility).
  ///
  /// On iOS 26+ title/subtitle changes are animated inside
  /// UIView.animate so the liquid-glass navigation bar morphs smoothly.
  /// The animation is skipped on the very first apply (isInitialApply)
  /// to avoid a flash during launch.
  private func applyTitleBar(_ state: [String: Any]) {
    guard let vc = viewController,
          let navController = vc.navigationController else { return }

    let navItem = vc.navigationItem

    if let title = state["title"] as? String {
      // Animate on iOS 26+ for liquid-glass morph; skip on first apply.
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

  /// Maps the JS largeTitleMode string to a UIKit display mode.
  ///
  /// - "large"  → .always  (always show the large title)
  /// - "inline" → .never   (always show the inline/small title)
  /// - anything else → .automatic (UIKit decides based on scroll)
  private func largeTitleDisplayMode(from string: String) -> UINavigationItem.LargeTitleDisplayMode {
    switch string {
    case "large": return .always
    case "inline": return .never
    default: return .automatic
    }
  }

  /// Creates or reuses a UIBarButtonItem for the given JS button state.
  ///
  /// - Parameter position: Cache namespace ("left", "right", or
  ///   "toolbar"). Combined with the item's id to form the cache key.
  ///
  /// Cached items are reused by identity so UIKit can animate transitions
  /// (and morph liquid-glass capsules on iOS 26+). Items with menus are
  /// always recreated because resetting UIBarButtonItem.menu does not
  /// reliably re-wire the new UIAction closures.
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

  /// Builds a UIMenu from the JS menu config (title + items array).
  @available(iOS 14.0, *)
  private func barButtonMenu(_ state: [String: Any], position: String) -> UIMenu? {
    let menuTitle = state["title"] as? String ?? ""
    guard let itemStates = state["items"] as? [[String: Any]] else { return nil }
    let children = itemStates.compactMap { barButtonMenuElement($0, position: position) }
    guard !children.isEmpty else { return nil }
    return UIMenu(title: menuTitle, children: children)
  }

  /// Recursively builds a single UIMenuElement — either a UIAction
  /// leaf or a nested UIMenu sub-group (when children is present).
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

  /// Target-action handler for bar button items on < iOS 14 (where
  /// UIAction-based menus are unavailable). The item's position and ID
  /// are encoded in its accessibilityIdentifier as "position:id".
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

  /// Routes the navigation area to either the modern (iOS 18+) or legacy
  /// path. The modern path uses UITabBarController with UITab /
  /// UISearchTab; the legacy path manages a standalone UITabBar.
  private func applyNavigation(_ state: [String: Any]) {
    guard let vc = viewController else { return }
    if #available(iOS 18.0, *) {
      applyNavigationModern(state, vc: vc)
    } else {
      applyNavigationLegacy(state, vc: vc)
    }
  }

  // ── Navigation: Legacy Path (< iOS 18) ──────────────────────────────────

  /// Applies the navigation area on iOS < 18 using a standalone
  /// UITabBar pinned to the bottom of vc.view.
  ///
  /// Search-role items are handled by lazily creating a
  /// UISearchController and attaching it to the navigation item
  /// when the search tab is tapped.
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

  /// Applies the navigation area on iOS 18+ using a child
  /// UITabBarController with UITab / UISearchTab.
  ///
  /// This gives us the native floating tab bar on iOS 26+, automatic
  /// sidebar adaptation on iPad, and system-managed search integration.
  ///
  /// ## Tab fingerprinting
  ///
  /// To avoid tearing down and recreating every UITab on each state
  /// update (which would reset scroll position, cancel animations, and
  /// lose the search session), the method computes a structural
  /// "fingerprint" — an array of "{id}:{role}" strings. Only when the
  /// fingerprint changes are tabs fully rebuilt; otherwise, mutable
  /// properties (title, image, subtitle, badge) are patched in-place.
  ///
  /// ## WKWebView reparenting
  ///
  /// The primary WKWebView is moved into the selected tab's placeholder
  /// view controller so UIKit can observe its UIScrollView for
  /// tab-bar auto-minimise on iOS 26+. See reparentWebView(to:)
  /// and parkWebView() for details.
  @available(iOS 18.0, *)
  private func applyNavigationModern(_ state: [String: Any], vc: ViewController) {
    // Lazily create UITabBarController and install into vc.view.
    if tabBarController == nil {
      let tbc = UITabBarController()
      tbc.delegate = self
      tbc.view.backgroundColor = .clear

      vc.addChild(tbc)
      tbc.view.translatesAutoresizingMaskIntoConstraints = false
      vc.view.addSubview(tbc.view)
      NSLayoutConstraint.activate([
        tbc.view.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor),
        tbc.view.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor),
        tbc.view.topAnchor.constraint(equalTo: vc.view.topAnchor),
        tbc.view.bottomAnchor.constraint(equalTo: vc.view.bottomAnchor),
      ])
      tbc.didMove(toParent: vc)

      tabBarController = tbc
    }

    guard let tbc = tabBarController else { return }

    // Don't rebuild tabs or change selection while the search session is
    // active — doing so cancels the search and causes focus loss.
    if isNavigationSearchActive {
      tbc.tabBar.isHidden = (state["hidden"] as? Bool) ?? false
      pendingSearchBarConfig = state["searchBar"] as? [String: Any]
      return
    }

    // Map NavigationConfig.style → UITabBarController.Mode:
    //   "tabs"    → .tabBar     (always show bottom tab bar)
    //   "sidebar" → .tabSidebar (iPad sidebar / tab bar on iPhone)
    //    default  → .automatic  (UIKit decides based on trait collection)
    if let styleStr = state["style"] as? String {
      switch styleStr {
      case "tabs":    tbc.mode = .tabBar
      case "sidebar": tbc.mode = .tabSidebar
      default:        tbc.mode = .automatic
      }
    } else {
      tbc.mode = .automatic
    }

    // Map NavigationConfig.minimizeBehavior → UITabBarController.MinimizeBehavior (iOS 26+):
    //   "never"        → .never        (tab bar always fully visible)
    //   "onScrollDown" → .onScrollDown (minimise when scrolling down)
    //   "onScrollUp"   → .onScrollUp   (minimise when scrolling up)
    //    default       → .automatic    (UIKit decides based on context)
    if #available(iOS 26.0, *) {
      if let behavior = state["minimizeBehavior"] as? String {
        switch behavior {
        case "never":        tbc.tabBarMinimizeBehavior = .never
        case "onScrollDown": tbc.tabBarMinimizeBehavior = .onScrollDown
        case "onScrollUp":   tbc.tabBarMinimizeBehavior = .onScrollUp
        default:             tbc.tabBarMinimizeBehavior = .automatic
        }
      } else {
        tbc.tabBarMinimizeBehavior = .automatic
      }
    }

    // ── Tab management ───────────────────────────────────────────────────
    // Only rebuild UITab objects when the structural identity of the tab
    // list changes (IDs, roles, search-bar presence). Mutable properties
    // like labels, badges and subtitles are updated in-place.

    var didRebuildTabs = false

    if let items = state["items"] as? [[String: Any]] {
      let hasSearchBar = state["searchBar"] is [String: Any]
      let newFingerprint: [String] = items.compactMap { item in
        guard let id = item["id"] as? String else { return nil }
        let role = item["role"] as? String ?? ""
        return role == "search" ? "\\(id):\\(role):\\(hasSearchBar)" : "\\(id):\\(role)"
      }

      if newFingerprint != tabFingerprint {
        // Structure changed — full rebuild.
        parkWebView()
        navigationSearchItemId = nil

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
        tabFingerprint = newFingerprint
        didRebuildTabs = true
      } else {
        // Structure unchanged — update mutable properties in-place.
        for tab in tbc.tabs {
          let itemState: [String: Any]?
          if tab is UISearchTab {
            itemState = items.first { ($0["role"] as? String) == "search" }
          } else {
            itemState = items.first { ($0["id"] as? String) == tab.identifier }
          }
          guard let itemState else { continue }

          if let label = itemState["label"] as? String { tab.title = label }
          let icon = (itemState["icon"] as? String).flatMap { UIImage(systemName: $0) }
          tab.image = (tab is UISearchTab) ? (icon ?? UIImage(systemName: "magnifyingglass")) : icon
          if let subtitle = itemState["subtitle"] as? String { tab.subtitle = subtitle }
          if !(tab is UISearchTab) {
            if let badge = itemState["badge"] as? String { tab.badgeValue = badge }
            else if let badge = itemState["badge"] as? Int { tab.badgeValue = String(badge) }
            else if itemState["badge"] is NSNull { tab.badgeValue = nil }
          }
        }
      }
    }

    // ── Selection ─────────────────────────────────────────────────────────
    let selectionBefore: String? = {
      guard let sel = tbc.selectedTab else { return nil }
      return sel is UISearchTab ? navigationSearchItemId : sel.identifier
    }()

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

    let selectionAfter: String? = {
      guard let sel = tbc.selectedTab else { return nil }
      return sel is UISearchTab ? navigationSearchItemId : sel.identifier
    }()

    // Reparent when tab VCs were recreated or the selection moved.
    if didRebuildTabs || selectionAfter != selectionBefore {
      reparentWebView(to: tbc)
    }

    // Hidden state.
    tbc.tabBar.isHidden = (state["hidden"] as? Bool) ?? false

    // Store search bar config for application when UISearchTab activates.
    pendingSearchBarConfig = state["searchBar"] as? [String: Any]
  }

  /// Moves the WKWebView back into vc.view using frame-based layout.
  /// Called before tearing down or rebuilding tab VCs so the webview is
  /// not lost when old view controllers are removed from the hierarchy.
  @available(iOS 18.0, *)
  private func parkWebView() {
    guard let webView = viewController?.webView, let vc = viewController,
          webView.superview !== vc.view else { return }
    NSLayoutConstraint.deactivate(webViewReparentConstraints)
    webViewReparentConstraints = []
    webView.translatesAutoresizingMaskIntoConstraints = true
    vc.view.insertSubview(webView, at: 0)
    webView.frame = vc.view.bounds
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
  }

  /// Moves the primary WKWebView into the selected tab's view controller
  /// so UIKit can observe its scroll view for tab-bar auto-minimize.
  ///
  /// UITab creates its view controller lazily via the
  /// viewControllerProvider closure.  After a full tab rebuild
  /// (tbc.tabs = ...) the selected tab's VC may not exist yet because
  /// UIKit has not laid out the tab bar controller.  When this happens
  /// the webview is temporarily placed inside tbc.view (behind the
  /// content area but in front of vc.view) so it remains visible, and
  /// a single deferred retry is scheduled on the next run loop
  /// iteration — by which time UIKit will have created the VC.
  @available(iOS 18.0, *)
  private func reparentWebView(to tbc: UITabBarController) {
    guard let webView = viewController?.webView else { return }
    guard let selectedVC = tbc.selectedTab?.viewController else {
      // VC not available yet — park inside tbc.view so the webview is
      // visible through the transparent content area while we wait.
      NSLayoutConstraint.deactivate(webViewReparentConstraints)
      webViewReparentConstraints = []
      if webView.superview !== tbc.view {
        webView.translatesAutoresizingMaskIntoConstraints = true
        tbc.view.insertSubview(webView, at: 0)
        webView.frame = tbc.view.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      }
      // Schedule exactly one deferred retry.
      if !hasPendingReparent {
        hasPendingReparent = true
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          self.hasPendingReparent = false
          guard let tbc = self.tabBarController else { return }
          self.reparentWebView(to: tbc)
        }
      }
      return
    }

    // UISearchTab wraps its VC in a UINavigationController — walk to the leaf.
    let target: UIViewController
    if let nav = selectedVC as? UINavigationController {
      target = nav.topViewController ?? selectedVC
    } else {
      target = selectedVC
    }

    // Deactivate previous constraints to avoid duplicates.
    NSLayoutConstraint.deactivate(webViewReparentConstraints)

    // Move the webview into the target if it isn't already there.
    if webView.superview !== target.view {
      target.view.insertSubview(webView, at: 0)
    }

    // Pin the webview to the target's edges.  Using Auto Layout instead
    // of frame + autoresizingMask handles the case where the target VC's
    // view still has zero bounds when first created by the
    // viewControllerProvider.
    webView.translatesAutoresizingMaskIntoConstraints = false
    let constraints = [
      webView.leadingAnchor.constraint(equalTo: target.view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: target.view.trailingAnchor),
      webView.topAnchor.constraint(equalTo: target.view.topAnchor),
      webView.bottomAnchor.constraint(equalTo: target.view.bottomAnchor),
    ]
    NSLayoutConstraint.activate(constraints)
    webViewReparentConstraints = constraints
  }

  /// Returns true when the given search bar belongs to the navigation search
  /// controller (legacy path) or the UITabBarController's search (modern path).
  private func isNavigationSearchBar(_ searchBar: UISearchBar) -> Bool {
    if searchBar === navigationSearchController?.searchBar { return true }
    if #available(iOS 18.0, *), tabBarController != nil { return true }
    return false
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  /// Applies the toolbar area — maps items onto the
  /// UINavigationController's bottom toolbar (setToolbarItems).
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

  /// Converts a single toolbar-item state dict into a UIBarButtonItem.
  /// Handles the special "flexible-space" and "fixed-space" types
  /// directly; everything else delegates to barButtonItem(_:position:).
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

  /// Applies the statusBar area — sets the status bar style
  /// ("light" / "dark" / default) and visibility.
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

  /// Applies the homeIndicator area — controls whether the home
  /// indicator (the bottom swipe affordance) should auto-hide.
  private func applyHomeIndicator(_ state: [String: Any]) {
    guard let vc = viewController else { return }

    if let hidden = state["hidden"] as? Bool {
      vc.homeIndicatorHidden = hidden
    }
    vc.setNeedsUpdateOfHomeIndicatorAutoHidden()
  }

  // ── Search Bar ────────────────────────────────────────────────────────────

  /// Applies a search bar to the title bar's navigation item.
  ///
  /// This is used when titleBar.searchBar is set (independent of the
  /// navigation search-role tab). Lazily creates a UISearchController
  /// and attaches it to vc.navigationItem.
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

  /// Presents or updates a child webview sheet.
  ///
  /// When presented is true the method either reuses an existing
  /// NativiteSheetViewController or creates a new one, configures its
  /// detents, grab handle, corner radius, background colour, and URL, then
  /// presents it modally. When presented is false the sheet is dismissed.
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

  /// Presents or removes a tab-bottom accessory — a small child webview
  /// docked above the tab bar.
  ///
  /// On iOS 26+ this uses the native UITabAccessory API for liquid-glass
  /// styling. On older versions a manually-constrained UIViewController
  /// is added above the tab bar.
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

  /// Tears down the tab-bottom accessory (if any) without sending events.
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

  /// Routes a message from the main webview to a named child webview
  /// (sheet or tab-bottom accessory). Called by the bridge handler for
  /// "__chrome_messaging_post_to_child__".
  func postMessageToChild(name: String, payload: Any?) {
    if name == "tabBottomAccessory" {
      tabBottomAccessoryVC?.receiveMessage(from: "main", payload: payload)
      return
    }
    guard let sheetVC = viewController?.presentedViewController as? NativiteSheetViewController,
          sheetVC.instanceName == name else { return }
    sheetVC.receiveMessage(from: "main", payload: payload)
  }

  /// Broadcasts a message to all webview instances (main + all children).
  /// The sender's own instance is excluded to avoid echo.
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

  /// Resolves the instance name ("sheet", "tabBottomAccessory", etc.)
  /// for a given WKWebView reference. Used by the bridge to identify which
  /// child originated an incoming message.
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

  /// Maps a JS detent name to a UISheetPresentationController.Detent.
  /// "small" and "full" are custom detents (25 % and 100 %);
  /// "medium" and "large" use the system detents.
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

  /// Resets a single chrome area to its default (hidden/empty) state.
  /// Called for any area that was present in the previous applyState
  /// call but is now absent from the incoming state snapshot.
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

  /// Clears the title bar — hides the navigation bar, removes bar button
  /// items, search controller, and purges the title-bar item cache.
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

  /// Tears down the navigation area — parks the webview back into
  /// vc.view, removes the UITabBarController (iOS 18+), resets the
  /// tab fingerprint, and hides the legacy tab bar.
  private func resetNavigation() {
    if #available(iOS 18.0, *) {
      parkWebView()
      if let tbc = tabBarController {
        tbc.willMove(toParent: nil)
        tbc.view.removeFromSuperview()
        tbc.removeFromParent()
        tabBarController = nil
      }
      tabFingerprint = []
      pendingSearchBarConfig = nil
      isNavigationSearchActive = false
      hasPendingReparent = false
    }
    tabBar.isHidden = true
    navigationSearchItemId = nil
    navigationSearchController = nil
    lastNonSearchTabId = nil
  }

  /// Hides the bottom toolbar and purges the toolbar item cache.
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

// ─── UITabBarDelegate (legacy < iOS 18) ──────────────────────────────────────
// Handles tab selection on the standalone UITabBar used before iOS 18.
// Search-role tabs are special-cased: selecting one attaches the search
// controller to the navigation item and activates it programmatically.

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
// Handles tab selection, search begin, and search end on the modern
// UITabBarController path. The WKWebView is reparented into the newly
// selected tab's VC on each selection change.

@available(iOS 18.0, *)
extension NativiteChrome: UITabBarControllerDelegate {
  /// Called when the user taps a different tab — reparents the WKWebView
  /// into the newly-selected tab VC and emits a JS event.
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
    reparentWebView(to: tabBarController)
    sendEvent(name: "navigation.itemPressed", data: ["id": id])
  }

  /// Fires when the UISearchTab's search session starts. Sets a guard
  /// flag so applyNavigationModern won't rebuild tabs mid-search
  /// (which would cancel the search and cause focus loss).
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

  /// Fires when the user cancels the UISearchTab search. State changes
  /// (clearing the active flag, restoring the previous tab selection,
  /// reparenting the webview) are deferred to the next run-loop turn
  /// because UIKit's end-of-search transition is still in progress at
  /// this point — mutating state synchronously conflicts with it.
  func tabBarController(
    _ tabBarController: UITabBarController,
    willEndSearch searchController: UISearchController
  ) {
    sendEvent(name: "navigation.searchCancelled", data: [:])
    let prevId = lastNonSearchTabId
    DispatchQueue.main.async { [weak self, weak tabBarController] in
      self?.isNavigationSearchActive = false
      if let prevId,
         let tbc = tabBarController,
         let tab = tbc.tabs.first(where: { $0.identifier == prevId }) {
        tbc.selectedTab = tab
      }
      if let tbc = tabBarController {
        self?.reparentWebView(to: tbc)
      }
    }
  }
}

// ─── UISearchBarDelegate (navigation search) ─────────────────────────────────
// Handles text changes, submit, and cancel for both the legacy (< iOS 18)
// search controller and the modern UISearchTab search bar.

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
// On the modern path, UISearchResultsUpdating is preferred over
// UISearchBarDelegate for real-time text updates because UIKit wires it
// automatically when the UISearchTab activates.

extension NativiteChrome: UISearchResultsUpdating {
  func updateSearchResults(for searchController: UISearchController) {
    let text = searchController.searchBar.text ?? ""
    sendEvent(name: "navigation.searchChanged", data: ["value": text])
  }
}

// ─── Supporting: NativiteSheetViewController ─────────────────────────────────
// A modally-presented child webview that shares the same WKWebsiteDataStore
// (and therefore localStorage, IndexedDB, cookies) as the primary webview.
// Presented as a UISheetPresentationController with configurable detents.

private class NativiteSheetViewController: UIViewController,
  UISheetPresentationControllerDelegate,
  WKNavigationDelegate
{
  weak var bridge: NativiteChrome?
  weak var nativeBridge: NativiteBridge?
  // The name given to sheet("name", ...) on the JS side. Injected as
  // window.__nativekit_instance_name__ so the native message broker
  // can correctly route postToParent/broadcast calls from this webview.
  /// The JS-side name for this sheet instance (e.g. "settings").
  /// Injected into the child webview as
  /// window.__nativekit_instance_name__ so the native message broker
  /// can route messages from this child back to the correct sheet.
  var instanceName: String = "sheet"
  private(set) var webView: NativiteWebView!
  /// The last fully-resolved URL loaded into this webview. Used to
  /// avoid re-loading the same page on every state update.
  private var lastLoadedURL: URL?
  /// If the load target is a file:// URL with an SPA route (e.g.
  /// "/settings"), the route is stored here and injected via
  /// history.replaceState after webView:didFinish:.
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

  /// Emits a sheet.loadFailed event to JS with the error details.
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

  /// Emits a sheet.detentChanged event when the user drags the sheet
  /// to a different detent (small / medium / large / full).
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
// A small child webview docked above the tab bar. On iOS 26+ it is installed
// as a native UITabAccessory for liquid-glass styling; on older versions it
// is manually constrained above the tab bar. Shares the same URL resolution
// and SPA routing logic as NativiteSheetViewController.

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
// Parses CSS-style hex colour strings ("#RRGGBB" or "#RRGGBBAA")
// into UIColor. Used by applySheet and applyTabBottomAccessory for
// the backgroundColor property.

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
import WebKit

// NativiteChrome reconciles declarative chrome state from JS onto AppKit.
// Manages: titleBar (NSToolbar), navigation (NSTabView), sidebarPanel
// (NSSplitViewController + NSOutlineView), menuBar, sheets (NSPanel),
// drawers (NSSplitViewItem), appWindows (NSWindow), popovers (NSPopover),
// and inter-webview messaging.
class NativiteChrome: NSObject {

  weak var viewController: ViewController?
  weak var vars: NativiteVars?

  // Track built menu item actions for target-action dispatch.
  private var menuActions: [String: String] = [:] // tag → id
  private var lastAppliedAreas: Set<String> = []

  // ── NSToolbar state ──────────────────────────────────────────────────────
  private var toolbar: NSToolbar?
  private var toolbarItemIdentifiers: [NSToolbarItem.Identifier] = []
  private var toolbarItems: [NSToolbarItem.Identifier: NSToolbarItem] = [:]
  // Maps toolbar item identifiers to their JS id for event dispatch.
  private var toolbarItemActions: [NSToolbarItem.Identifier: String] = [:]
  // Menus attached to toolbar buttons, keyed by JS id.
  private var toolbarMenuActions: [String: String] = [:]
  // Pending toolbar state to merge titleBar items + toolbar items.
  private var pendingLeadingItems: [[String: Any]]?
  private var pendingTrailingItems: [[String: Any]]?
  private var pendingToolbarItems: [[String: Any]]?
  private var pendingSearchBar: [String: Any]?

  // ── NSTabView state ──────────────────────────────────────────────────────
  private var tabView: NSTabView?
  private var navigationItems: [[String: Any]] = []

  // ── NSSplitViewController state ──────────────────────────────────────────
  private var splitViewController: NSSplitViewController?
  private var sidebarItems: [SidebarNode] = []
  private var sidebarOutlineView: NSOutlineView?
  private var sidebarScrollView: NSScrollView?
  private var sidebarActiveItemId: String?

  // ── Child webview registries ─────────────────────────────────────────────
  private var activeSheets: [String: NSPanel] = [:]
  private var activeDrawerItems: [String: NSSplitViewItem] = [:]
  private var activeAppWindows: [String: NSWindow] = [:]
  private var activePopovers: [String: NSPopover] = [:]
  // All child webviews indexed by instance name for messaging.
  private var childWebViews: [String: WKWebView] = [:]

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
      if let toolbarState = state["toolbar"] as? [String: Any] {
        self.applyToolbar(toolbarState)
      }
      if let navigationState = state["navigation"] as? [String: Any] {
        self.applyNavigation(navigationState)
      }
      if let menuBarState = state["menuBar"] as? [String: Any] {
        self.applyMenuBar(menuBarState)
      }
      if let sidebarPanelState = state["sidebarPanel"] as? [String: Any] {
        self.applySidebarPanel(sidebarPanelState)
      }
      if let sheets = state["sheets"] as? [String: [String: Any]] {
        for (name, sheetState) in sheets {
          self.applySheet(name: name, state: sheetState)
        }
      }
      if let drawers = state["drawers"] as? [String: [String: Any]] {
        for (name, drawerState) in drawers {
          self.applyDrawer(name: name, state: drawerState)
        }
      }
      if let appWindows = state["appWindows"] as? [String: [String: Any]] {
        for (name, windowState) in appWindows {
          self.applyAppWindow(name: name, state: windowState)
        }
      }
      if let popovers = state["popovers"] as? [String: [String: Any]] {
        for (name, popoverState) in popovers {
          self.applyPopover(name: name, state: popoverState)
        }
      }

      // Rebuild the unified NSToolbar after both titleBar and toolbar areas
      // have been processed so all items are merged into a single toolbar.
      self.rebuildToolbarIfNeeded()

      // Push updated chrome geometry to CSS variables.
      self.pushVarUpdates()

      // iOS-only areas are no-ops: statusBar, homeIndicator, keyboard,
      // tabBottomAccessory
    }
  }

  private func pushVarUpdates() {
    guard let window = viewController?.view.window else { return }
    let titlebarHeight = window.frame.height - window.contentLayoutRect.height
    let hasToolbar = toolbar != nil
    let hasTabView = tabView != nil && !(tabView?.isHidden ?? true)
    let tabHeight: CGFloat = hasTabView ? 28 : 0
    vars?.updateChrome(
      navHeight: titlebarHeight, navVisible: true,
      tabHeight: tabHeight, tabVisible: hasTabView,
      toolbarHeight: nil, toolbarVisible: hasToolbar
    )
  }

  // ── Inter-webview messaging ────────────────────────────────────────────────

  func postMessageToChild(name: String, payload: Any?) {
    guard let webView = childWebViews[name] else { return }
    deliverMessage(to: webView, from: "main", payload: payload)
  }

  func broadcastMessage(from sender: String, payload: Any?) {
    // Forward to primary webview unless sender is main
    if sender != "main" {
      sendEvent(name: "message", data: ["from": sender, "payload": payload ?? NSNull()])
    }
    // Forward to all child webviews except the sender
    for (name, webView) in childWebViews where name != sender {
      deliverMessage(to: webView, from: sender, payload: payload)
    }
  }

  func instanceName(for webView: WKWebView?) -> String {
    guard let webView else { return "unknown" }
    for (name, wv) in childWebViews where wv === webView {
      return name
    }
    return "unknown"
  }

  private func deliverMessage(to webView: WKWebView, from sender: String, payload: Any?) {
    let data: [String: Any] = ["from": sender, "payload": payload ?? NSNull()]
    let message: [String: Any] = ["id": NSNull(), "type": "event", "event": "message", "data": data]
    guard JSONSerialization.isValidJSONObject(message),
      let msgData = try? JSONSerialization.data(withJSONObject: message),
      let json = String(data: msgData, encoding: .utf8)
    else { return }
    webView.evaluateJavaScript("window.nativiteReceive(\\(json))", completionHandler: nil)
  }
${applyInitialStateMethod}
  // ── Title Bar (macOS window + NSToolbar) ──────────────────────────────────

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

    // Store leading/trailing items for the unified toolbar rebuild.
    pendingLeadingItems = state["leadingItems"] as? [[String: Any]]
    pendingTrailingItems = state["trailingItems"] as? [[String: Any]]
    pendingSearchBar = state["searchBar"] as? [String: Any]
  }

  // ── Toolbar ──────────────────────────────────────────────────────────────

  private func applyToolbar(_ state: [String: Any]) {
    pendingToolbarItems = state["items"] as? [[String: Any]]
  }

  // ── Unified NSToolbar rebuild ────────────────────────────────────────────

  private func rebuildToolbarIfNeeded() {
    let hasLeading = pendingLeadingItems != nil
    let hasTrailing = pendingTrailingItems != nil
    let hasToolbar = pendingToolbarItems != nil
    let hasSearch = pendingSearchBar != nil

    guard hasLeading || hasTrailing || hasToolbar || hasSearch else {
      // No toolbar-related state — remove toolbar if it exists.
      if toolbar != nil {
        viewController?.view.window?.toolbar = nil
        toolbar = nil
        toolbarItemIdentifiers = []
        toolbarItems = [:]
        toolbarItemActions = [:]
        toolbarMenuActions = [:]
      }
      return
    }

    guard let window = viewController?.view.window else { return }

    // Lazily create the toolbar.
    if toolbar == nil {
      let tb = NSToolbar(identifier: "NativiteToolbar")
      tb.delegate = self
      tb.displayMode = .iconAndLabel
      tb.allowsUserCustomization = false
      window.toolbar = tb
      toolbar = tb
    }

    // Build the ordered identifier list:
    // [leading items] [flexible space] [toolbar items] [flexible space] [trailing items]
    var identifiers: [NSToolbarItem.Identifier] = []
    var items: [NSToolbarItem.Identifier: NSToolbarItem] = [:]
    var actions: [NSToolbarItem.Identifier: String] = [:]

    toolbarMenuActions.removeAll()

    // Leading items from titleBar
    if let leadingItems = pendingLeadingItems {
      for itemState in leadingItems {
        if let item = makeToolbarItem(itemState, position: "leading") {
          identifiers.append(item.itemIdentifier)
          items[item.itemIdentifier] = item
          if let id = itemState["id"] as? String {
            actions[item.itemIdentifier] = id
          }
        }
      }
    }

    identifiers.append(.flexibleSpace)

    // Center toolbar items
    if let toolbarItemStates = pendingToolbarItems {
      for itemState in toolbarItemStates {
        if let type = itemState["type"] as? String, type == "flexible-space" {
          identifiers.append(.flexibleSpace)
          continue
        }
        if let type = itemState["type"] as? String, type == "fixed-space" {
          identifiers.append(.space)
          continue
        }
        if let item = makeToolbarItem(itemState, position: "toolbar") {
          identifiers.append(item.itemIdentifier)
          items[item.itemIdentifier] = item
          if let id = itemState["id"] as? String {
            actions[item.itemIdentifier] = id
          }
        }
      }
    }

    identifiers.append(.flexibleSpace)

    // Search bar item
    if let searchState = pendingSearchBar {
      let searchId = NSToolbarItem.Identifier("nativite.search")
      let searchItem = NSSearchToolbarItem(itemIdentifier: searchId)
      if let placeholder = searchState["placeholder"] as? String {
        searchItem.searchField.placeholderString = placeholder
      }
      if let value = searchState["value"] as? String {
        searchItem.searchField.stringValue = value
      }
      searchItem.searchField.delegate = self
      identifiers.append(searchId)
      items[searchId] = searchItem
    }

    // Trailing items from titleBar
    if let trailingItems = pendingTrailingItems {
      for itemState in trailingItems {
        if let item = makeToolbarItem(itemState, position: "trailing") {
          identifiers.append(item.itemIdentifier)
          items[item.itemIdentifier] = item
          if let id = itemState["id"] as? String {
            actions[item.itemIdentifier] = id
          }
        }
      }
    }

    toolbarItemIdentifiers = identifiers
    toolbarItems = items
    toolbarItemActions = actions

    // Force toolbar to re-query its items.
    toolbar?.delegate = nil
    toolbar?.delegate = self

    // Clear pending state.
    pendingLeadingItems = nil
    pendingTrailingItems = nil
    pendingToolbarItems = nil
    pendingSearchBar = nil
  }

  private func makeToolbarItem(_ state: [String: Any], position: String) -> NSToolbarItem? {
    guard let id = state["id"] as? String else { return nil }
    let identifier = NSToolbarItem.Identifier("nativite.\\(position).\\(id)")

    // Check for attached menu
    if let menuConfig = state["menu"] as? [String: Any],
       let menuItems = menuConfig["items"] as? [[String: Any]] {
      let item = NSMenuToolbarItem(itemIdentifier: identifier)
      let label = state["label"] as? String ?? ""
      item.label = label
      item.toolTip = label
      if let symbolName = state["icon"] as? String {
        item.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: label)
      }
      let menu = NSMenu(title: menuConfig["title"] as? String ?? "")
      for menuItemState in menuItems {
        guard let menuItemLabel = menuItemState["label"] as? String,
              let menuItemId = menuItemState["id"] as? String else { continue }
        let keyEquiv = menuItemState["keyEquivalent"] as? String ?? ""
        let nsItem = NSMenuItem(title: menuItemLabel, action: #selector(toolbarMenuItemClicked(_:)), keyEquivalent: keyEquiv)
        nsItem.target = self
        nsItem.tag = toolbarMenuActions.count
        toolbarMenuActions[String(nsItem.tag)] = menuItemId
        if let symbolName = menuItemState["icon"] as? String {
          nsItem.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
        }
        if (menuItemState["disabled"] as? Bool) ?? false { nsItem.isEnabled = false }
        if (menuItemState["checked"] as? Bool) ?? false { nsItem.state = .on }
        if (menuItemState["style"] as? String) == "destructive" {
          nsItem.attributedTitle = NSAttributedString(string: menuItemLabel, attributes: [.foregroundColor: NSColor.systemRed])
        }
        menu.addItem(nsItem)
      }
      item.menu = menu
      item.isEnabled = !((state["disabled"] as? Bool) ?? false)
      return item
    }

    let item = NSToolbarItem(itemIdentifier: identifier)
    let label = state["label"] as? String ?? ""
    item.label = label
    item.toolTip = label
    if let symbolName = state["icon"] as? String {
      item.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: label)
    }
    item.target = self
    item.action = #selector(toolbarItemClicked(_:))
    item.isEnabled = !((state["disabled"] as? Bool) ?? false)

    // Tint
    if let tint = state["tint"] as? String {
      let color = NSColor(hex: tint)
      if let image = item.image {
        let tinted = image.copy() as! NSImage
        tinted.lockFocus()
        color.set()
        let imageRect = NSRect(origin: .zero, size: tinted.size)
        imageRect.fill(using: .sourceAtop)
        tinted.unlockFocus()
        item.image = tinted
      }
    }

    // Badge via title suffix
    if let badge = state["badge"] as? String {
      item.label = "\\(label) (\\(badge))"
    } else if let badge = state["badge"] as? Int {
      item.label = "\\(label) (\\(badge))"
    }

    return item
  }

  @objc private func toolbarItemClicked(_ sender: NSToolbarItem) {
    guard let jsId = toolbarItemActions[sender.itemIdentifier] else { return }
    // Determine which area's event to emit based on identifier prefix.
    let idStr = sender.itemIdentifier.rawValue
    if idStr.hasPrefix("nativite.leading.") {
      sendEvent(name: "titleBar.leadingItemPressed", data: ["id": jsId])
    } else if idStr.hasPrefix("nativite.trailing.") {
      sendEvent(name: "titleBar.trailingItemPressed", data: ["id": jsId])
    } else {
      sendEvent(name: "toolbar.itemPressed", data: ["id": jsId])
    }
  }

  @objc private func toolbarMenuItemClicked(_ sender: NSMenuItem) {
    guard let id = toolbarMenuActions[String(sender.tag)] else { return }
    // Determine parent area from the toolbar item that owns the menu.
    sendEvent(name: "titleBar.menuItemPressed", data: ["id": id])
  }

  // ── Navigation (NSTabView) ────────────────────────────────────────────────

  private func applyNavigation(_ state: [String: Any]) {
    guard let items = state["items"] as? [[String: Any]] else { return }
    navigationItems = items

    let hidden = (state["hidden"] as? Bool) ?? false

    // Lazily create NSTabView
    if tabView == nil {
      let tv = NSTabView()
      tv.tabViewType = .topTabsBezelBorder
      tv.delegate = self
      tv.translatesAutoresizingMaskIntoConstraints = false
      tabView = tv

      // Insert the tab view into the view hierarchy. If a split view controller
      // exists, the tab view wraps the content area. Otherwise add it directly
      // to the ViewController's view.
      installTabView(tv)
    }

    guard let tv = tabView else { return }

    // Rebuild tabs if the set of items has changed.
    let currentIds = tv.tabViewItems.compactMap { $0.identifier as? String }
    let newIds = items.compactMap { $0["id"] as? String }

    if currentIds != newIds {
      // Remove all existing tabs
      for item in tv.tabViewItems.reversed() {
        tv.removeTabViewItem(item)
      }
      // Add new tabs
      for itemState in items {
        guard let id = itemState["id"] as? String else { continue }
        let tabItem = NSTabViewItem(identifier: id)
        tabItem.label = itemState["label"] as? String ?? ""
        if let symbolName = itemState["icon"] as? String {
          tabItem.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
        }
        tv.addTabViewItem(tabItem)
      }
    } else {
      // Update labels and icons in-place.
      for (index, itemState) in items.enumerated() where index < tv.tabViewItems.count {
        let tabItem = tv.tabViewItems[index]
        if let label = itemState["label"] as? String { tabItem.label = label }
        if let symbolName = itemState["icon"] as? String {
          tabItem.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
        }
      }
    }

    // Selection
    if let activeId = state["activeItem"] as? String {
      if let idx = tv.tabViewItems.firstIndex(where: { ($0.identifier as? String) == activeId }) {
        tv.selectTabViewItem(at: idx)
      }
    }

    tv.isHidden = hidden
  }

  private func installTabView(_ tv: NSTabView) {
    guard let vc = viewController else { return }
    if let split = splitViewController {
      // Tab view goes into the detail area
      let detailItem = split.splitViewItems.last
      detailItem?.viewController.view.addSubview(tv)
      if let parentView = detailItem?.viewController.view {
        NSLayoutConstraint.activate([
          tv.topAnchor.constraint(equalTo: parentView.topAnchor),
          tv.leadingAnchor.constraint(equalTo: parentView.leadingAnchor),
          tv.trailingAnchor.constraint(equalTo: parentView.trailingAnchor),
        ])
      }
    } else {
      vc.view.addSubview(tv)
      NSLayoutConstraint.activate([
        tv.topAnchor.constraint(equalTo: vc.view.topAnchor),
        tv.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor),
        tv.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor),
      ])
    }
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

  // ── Sidebar Panel (NSSplitViewController + NSOutlineView) ──────────────────

  private func applySidebarPanel(_ state: [String: Any]) {
    guard let items = state["items"] as? [[String: Any]] else { return }

    let visible = (state["visible"] as? Bool) ?? true

    // Parse items into SidebarNode tree.
    sidebarItems = items.compactMap { SidebarNode.from($0) }
    sidebarActiveItemId = state["activeItem"] as? String

    // Lazily create the split view controller.
    if splitViewController == nil {
      guard let vc = viewController, let window = vc.view.window else { return }

      let split = NSSplitViewController()

      // Sidebar item — contains the outline view
      let sidebarVC = NSViewController()
      sidebarVC.view = NSView(frame: NSRect(x: 0, y: 0, width: 220, height: 400))
      let sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebarVC)
      sidebarItem.minimumThickness = 180
      sidebarItem.maximumThickness = 320
      split.addSplitViewItem(sidebarItem)

      // Detail item — wraps the existing ViewController
      let detailItem = NSSplitViewItem(viewController: vc)
      split.addSplitViewItem(detailItem)

      // Swap window content
      window.contentViewController = split
      splitViewController = split

      // Build outline view
      let scrollView = NSScrollView()
      scrollView.translatesAutoresizingMaskIntoConstraints = false
      scrollView.hasVerticalScroller = true
      scrollView.drawsBackground = false

      let outlineView = NSOutlineView()
      outlineView.headerView = nil
      outlineView.indentationPerLevel = 16
      outlineView.style = .sourceList
      let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("sidebar"))
      column.isEditable = false
      outlineView.addTableColumn(column)
      outlineView.outlineTableColumn = column
      outlineView.dataSource = self
      outlineView.delegate = self

      scrollView.documentView = outlineView
      sidebarVC.view.addSubview(scrollView)
      NSLayoutConstraint.activate([
        scrollView.topAnchor.constraint(equalTo: sidebarVC.view.topAnchor),
        scrollView.leadingAnchor.constraint(equalTo: sidebarVC.view.leadingAnchor),
        scrollView.trailingAnchor.constraint(equalTo: sidebarVC.view.trailingAnchor),
        scrollView.bottomAnchor.constraint(equalTo: sidebarVC.view.bottomAnchor),
      ])

      sidebarOutlineView = outlineView
      sidebarScrollView = scrollView

      // If a tab view was already installed, reparent it into the detail area.
      if let tv = tabView {
        tv.removeFromSuperview()
        installTabView(tv)
      }
    }

    sidebarOutlineView?.reloadData()

    // Select the active item.
    if let activeId = sidebarActiveItemId, let outlineView = sidebarOutlineView {
      if let node = findSidebarNode(withId: activeId, in: sidebarItems) {
        let row = outlineView.row(forItem: node)
        if row >= 0 {
          outlineView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        }
      }
    }

    // Toggle sidebar visibility.
    if let sidebarItem = splitViewController?.splitViewItems.first {
      sidebarItem.isCollapsed = !visible
    }

    // Title
    if let title = state["title"] as? String {
      viewController?.view.window?.title = title
    }
  }

  private func findSidebarNode(withId id: String, in nodes: [SidebarNode]) -> SidebarNode? {
    for node in nodes {
      if node.id == id { return node }
      if let found = findSidebarNode(withId: id, in: node.children) { return found }
    }
    return nil
  }

  // ── Sheet (NSPanel) ────────────────────────────────────────────────────────

  private func applySheet(name: String, state: [String: Any]) {
    guard let vc = viewController, let window = vc.view.window else { return }
    let presented = state["presented"] as? Bool ?? false

    if presented {
      if let existing = activeSheets[name] {
        // Update existing sheet
        updateChildWebView(in: existing.contentViewController!, state: state, name: name, relativeTo: vc.webView.url)
        return
      }

      // Create new sheet panel
      let width: CGFloat = 480
      let height: CGFloat = resolveSheetHeight(state, windowHeight: window.frame.height)
      let panel = NSPanel(
        contentRect: NSRect(x: 0, y: 0, width: width, height: height),
        styleMask: [.titled, .closable, .resizable],
        backing: .buffered,
        defer: false
      )
      panel.isFloatingPanel = false

      if let hex = state["backgroundColor"] as? String {
        panel.backgroundColor = NSColor(hex: hex)
      }

      let childVC = NativiteChildWebViewController()
      childVC.instanceName = name
      childVC.chrome = self
      childVC.nativeBridge = vc.nativiteBridgeHandler()
      panel.contentViewController = childVC
      childVC.loadViewIfNeeded()

      if let rawURL = state["url"] as? String {
        childVC.loadURL(rawURL, relativeTo: vc.webView.url)
      }

      childWebViews[name] = childVC.webView
      activeSheets[name] = panel

      let dismissible = state["dismissible"] as? Bool ?? true
      if !dismissible {
        panel.styleMask.remove(.closable)
      }

      window.beginSheet(panel) { [weak self] _ in
        self?.activeSheets.removeValue(forKey: name)
        self?.childWebViews.removeValue(forKey: name)
        self?.sendEvent(name: "sheet.dismissed", data: ["name": name])
      }
      sendEvent(name: "sheet.presented", data: ["name": name])
    } else {
      if let panel = activeSheets[name] {
        window.endSheet(panel)
      }
    }
  }

  private func resolveSheetHeight(_ state: [String: Any], windowHeight: CGFloat) -> CGFloat {
    if let detents = state["detents"] as? [String],
       let active = state["activeDetent"] as? String ?? detents.first {
      switch active {
      case "small":  return max(120, windowHeight * 0.25)
      case "medium": return windowHeight * 0.5
      case "large":  return windowHeight * 0.75
      case "full":   return windowHeight
      default: break
      }
    }
    return windowHeight * 0.5
  }

  // ── Drawer (NSSplitViewItem) ──────────────────────────────────────────────

  private func applyDrawer(name: String, state: [String: Any]) {
    guard let vc = viewController else { return }
    let presented = state["presented"] as? Bool ?? false

    if presented {
      if let existing = activeDrawerItems[name] {
        updateChildWebView(in: existing.viewController, state: state, name: name, relativeTo: vc.webView.url)
        return
      }

      // Ensure split view controller exists
      if splitViewController == nil {
        // Create a minimal split VC to host drawers
        guard let window = vc.view.window else { return }
        let split = NSSplitViewController()
        let detailItem = NSSplitViewItem(viewController: vc)
        split.addSplitViewItem(detailItem)
        window.contentViewController = split
        splitViewController = split
      }

      guard let split = splitViewController else { return }

      let childVC = NativiteChildWebViewController()
      childVC.instanceName = name
      childVC.chrome = self
      childVC.nativeBridge = vc.nativiteBridgeHandler()
      childVC.loadViewIfNeeded()

      let widthValue = state["width"]
      let thickness: CGFloat
      if let num = widthValue as? NSNumber {
        thickness = CGFloat(truncating: num)
      } else if let str = widthValue as? String {
        switch str {
        case "small": thickness = 200
        case "large": thickness = 400
        default: thickness = 300
        }
      } else {
        thickness = 300
      }

      childVC.view.frame = NSRect(x: 0, y: 0, width: thickness, height: 400)

      let side = state["side"] as? String ?? "trailing"
      let drawerItem: NSSplitViewItem
      if side == "leading" {
        drawerItem = NSSplitViewItem(sidebarWithViewController: childVC)
        split.insertSplitViewItem(drawerItem, at: 0)
      } else {
        drawerItem = NSSplitViewItem(inspectorWithViewController: childVC)
        split.addSplitViewItem(drawerItem)
      }
      drawerItem.minimumThickness = thickness
      drawerItem.preferredThicknessFraction = 0.25

      if let rawURL = state["url"] as? String {
        childVC.loadURL(rawURL, relativeTo: vc.webView.url)
      }

      childWebViews[name] = childVC.webView
      activeDrawerItems[name] = drawerItem
      sendEvent(name: "drawer.presented", data: ["name": name])
    } else {
      if let drawerItem = activeDrawerItems[name] {
        splitViewController?.removeSplitViewItem(drawerItem)
        activeDrawerItems.removeValue(forKey: name)
        childWebViews.removeValue(forKey: name)
        sendEvent(name: "drawer.dismissed", data: ["name": name])
      }
    }
  }

  // ── App Window (NSWindow) ──────────────────────────────────────────────────

  private func applyAppWindow(name: String, state: [String: Any]) {
    guard let vc = viewController else { return }
    let presented = state["presented"] as? Bool ?? false

    if presented {
      if let existing = activeAppWindows[name] {
        // Update existing window
        if let title = state["title"] as? String { existing.title = title }
        updateChildWebView(in: existing.contentViewController!, state: state, name: name, relativeTo: vc.webView.url)
        return
      }

      let width: CGFloat = (state["size"] as? [String: Any])?["width"] as? CGFloat ?? 600
      let height: CGFloat = (state["size"] as? [String: Any])?["height"] as? CGFloat ?? 400
      var mask: NSWindow.StyleMask = [.titled, .closable, .miniaturizable]
      if (state["resizable"] as? Bool) ?? true {
        mask.insert(.resizable)
      }

      let win = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: width, height: height),
        styleMask: mask,
        backing: .buffered,
        defer: false
      )
      win.title = state["title"] as? String ?? ""
      win.center()

      if let minSize = state["minSize"] as? [String: Any] {
        let minW = minSize["width"] as? CGFloat ?? 200
        let minH = minSize["height"] as? CGFloat ?? 200
        win.minSize = NSSize(width: minW, height: minH)
      }

      let childVC = NativiteChildWebViewController()
      childVC.instanceName = name
      childVC.chrome = self
      childVC.nativeBridge = vc.nativiteBridgeHandler()
      win.contentViewController = childVC
      childVC.loadViewIfNeeded()

      if let rawURL = state["url"] as? String {
        childVC.loadURL(rawURL, relativeTo: vc.webView.url)
      }

      childWebViews[name] = childVC.webView
      activeAppWindows[name] = win

      let isModal = (state["modal"] as? Bool) ?? false
      if isModal {
        vc.view.window?.beginSheet(win) { [weak self] _ in
          self?.activeAppWindows.removeValue(forKey: name)
          self?.childWebViews.removeValue(forKey: name)
          self?.sendEvent(name: "appWindow.dismissed", data: ["name": name])
        }
      } else {
        win.delegate = self
        win.makeKeyAndOrderFront(nil)
      }
      sendEvent(name: "appWindow.presented", data: ["name": name])
    } else {
      if let win = activeAppWindows[name] {
        if win.isSheet {
          vc.view.window?.endSheet(win)
        } else {
          win.close()
          activeAppWindows.removeValue(forKey: name)
          childWebViews.removeValue(forKey: name)
          sendEvent(name: "appWindow.dismissed", data: ["name": name])
        }
      }
    }
  }

  // ── Popover (NSPopover) ───────────────────────────────────────────────────

  private func applyPopover(name: String, state: [String: Any]) {
    guard let vc = viewController else { return }
    let presented = state["presented"] as? Bool ?? false

    if presented {
      if activePopovers[name] != nil { return }

      let popover = NSPopover()
      popover.behavior = .transient
      popover.delegate = self

      let width: CGFloat = (state["size"] as? [String: Any])?["width"] as? CGFloat ?? 320
      let height: CGFloat = (state["size"] as? [String: Any])?["height"] as? CGFloat ?? 240
      popover.contentSize = NSSize(width: width, height: height)

      let childVC = NativiteChildWebViewController()
      childVC.instanceName = name
      childVC.chrome = self
      childVC.nativeBridge = vc.nativiteBridgeHandler()
      popover.contentViewController = childVC
      childVC.loadViewIfNeeded()

      if let rawURL = state["url"] as? String {
        childVC.loadURL(rawURL, relativeTo: vc.webView.url)
      }

      childWebViews[name] = childVC.webView
      activePopovers[name] = popover

      // Determine anchor rect
      if let anchorId = state["anchorElementId"] as? String {
        let js = "(() => { const el = document.getElementById('\\(anchorId)'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()"
        vc.webView.evaluateJavaScript(js) { [weak self, weak popover, weak vc] result, _ in
          guard let self, let popover, let vc else { return }
          var rect = NSRect(x: 0, y: 0, width: 1, height: 1)
          if let dict = result as? [String: Any] {
            let x = dict["x"] as? CGFloat ?? 0
            let y = dict["y"] as? CGFloat ?? 0
            let w = dict["w"] as? CGFloat ?? 1
            let h = dict["h"] as? CGFloat ?? 1
            // Convert from web coordinates (top-left origin) to NSView (bottom-left)
            let viewHeight = vc.webView.frame.height
            rect = NSRect(x: x, y: viewHeight - y - h, width: w, height: h)
          }
          popover.show(relativeTo: rect, of: vc.webView, preferredEdge: .minY)
          self.sendEvent(name: "popover.presented", data: ["name": name])
        }
      } else {
        // No anchor — show at center of webview
        let center = NSRect(x: vc.webView.bounds.midX - 1, y: vc.webView.bounds.midY - 1, width: 2, height: 2)
        popover.show(relativeTo: center, of: vc.webView, preferredEdge: .minY)
        sendEvent(name: "popover.presented", data: ["name": name])
      }
    } else {
      if let popover = activePopovers[name] {
        popover.performClose(nil)
        activePopovers.removeValue(forKey: name)
        childWebViews.removeValue(forKey: name)
        sendEvent(name: "popover.dismissed", data: ["name": name])
      }
    }
  }

  // ── Child webview update helper ───────────────────────────────────────────

  private func updateChildWebView(in viewController: NSViewController, state: [String: Any], name: String, relativeTo baseURL: URL?) {
    guard let childVC = viewController as? NativiteChildWebViewController else { return }
    if let rawURL = state["url"] as? String {
      childVC.loadURL(rawURL, relativeTo: baseURL)
    }
    if let hex = state["backgroundColor"] as? String {
      childVC.view.layer?.backgroundColor = NSColor(hex: hex).cgColor
    }
  }

  // ── Area cleanup ───────────────────────────────────────────────────────────

  private func resetArea(_ area: String) {
    switch area {
    case "titleBar":      resetTitleBar()
    case "toolbar":       resetToolbar()
    case "navigation":    resetNavigation()
    case "menuBar":       resetMenuBar()
    case "sidebarPanel":  resetSidebarPanel()
    case "sheets":        resetSheets()
    case "drawers":       resetDrawers()
    case "appWindows":    resetAppWindows()
    case "popovers":      resetPopovers()
    default: break
    }
  }

  private func resetTitleBar() {
    guard let window = viewController?.view.window else { return }
    window.title = ""
    window.subtitle = ""
    window.titlebarSeparatorStyle = .automatic
    window.titleVisibility = .visible
    pendingLeadingItems = nil
    pendingTrailingItems = nil
    pendingSearchBar = nil
    // Toolbar removal handled if toolbar area is also absent.
  }

  private func resetToolbar() {
    pendingToolbarItems = nil
    if !lastAppliedAreas.contains("titleBar") {
      // Only remove the toolbar if titleBar is also gone.
      viewController?.view.window?.toolbar = nil
      toolbar = nil
      toolbarItemIdentifiers = []
      toolbarItems = [:]
      toolbarItemActions = [:]
      toolbarMenuActions = [:]
    }
  }

  private func resetNavigation() {
    if let tv = tabView {
      tv.removeFromSuperview()
      tabView = nil
    }
    navigationItems = []
  }

  private func resetMenuBar() {
    NSApp.mainMenu = nil
    menuActions.removeAll()
  }

  private func resetSidebarPanel() {
    if let split = splitViewController, let vc = viewController, let window = vc.view.window {
      // Remove the split view and restore the VC directly.
      window.contentViewController = vc
      splitViewController = nil
      sidebarOutlineView = nil
      sidebarScrollView = nil
      sidebarItems = []

      // Reinstall tab view if present
      if let tv = tabView {
        tv.removeFromSuperview()
        installTabView(tv)
      }
    }
  }

  private func resetSheets() {
    guard let window = viewController?.view.window else { return }
    for (name, panel) in activeSheets {
      window.endSheet(panel)
      childWebViews.removeValue(forKey: name)
    }
    activeSheets.removeAll()
  }

  private func resetDrawers() {
    guard let split = splitViewController else { return }
    for (name, item) in activeDrawerItems {
      split.removeSplitViewItem(item)
      childWebViews.removeValue(forKey: name)
    }
    activeDrawerItems.removeAll()
  }

  private func resetAppWindows() {
    for (name, win) in activeAppWindows {
      if win.isSheet {
        viewController?.view.window?.endSheet(win)
      } else {
        win.close()
      }
      childWebViews.removeValue(forKey: name)
    }
    activeAppWindows.removeAll()
  }

  private func resetPopovers() {
    for (name, popover) in activePopovers {
      popover.performClose(nil)
      childWebViews.removeValue(forKey: name)
    }
    activePopovers.removeAll()
  }
${sendEventMethod}
}

// ─── NSToolbarDelegate ────────────────────────────────────────────────────────

extension NativiteChrome: NSToolbarDelegate {
  func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    toolbarItemIdentifiers
  }

  func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    toolbarItemIdentifiers
  }

  func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
    toolbarItems[itemIdentifier]
  }
}

// ─── NSSearchFieldDelegate (toolbar search bar) ──────────────────────────────

extension NativiteChrome: NSSearchFieldDelegate {
  func controlTextDidChange(_ obj: Notification) {
    guard let field = obj.object as? NSSearchField else { return }
    sendEvent(name: "titleBar.searchChanged", data: ["value": field.stringValue])
  }

  func searchFieldDidStartSearching(_ sender: NSSearchField) {}

  func searchFieldDidEndSearching(_ sender: NSSearchField) {
    sendEvent(name: "titleBar.searchCancelled", data: [:])
  }

  func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
    if commandSelector == #selector(NSResponder.insertNewline(_:)) {
      if let field = control as? NSSearchField {
        sendEvent(name: "titleBar.searchSubmitted", data: ["value": field.stringValue])
      }
      return true
    }
    return false
  }
}

// ─── NSTabViewDelegate ──────────────────────────────────────────────────────

extension NativiteChrome: NSTabViewDelegate {
  func tabView(_ tabView: NSTabView, didSelect tabViewItem: NSTabViewItem?) {
    guard let id = tabViewItem?.identifier as? String else { return }
    sendEvent(name: "navigation.itemPressed", data: ["id": id])
  }
}

// ─── NSOutlineViewDataSource + Delegate (sidebar) ────────────────────────────

extension NativiteChrome: NSOutlineViewDataSource {
  func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int {
    if let node = item as? SidebarNode { return node.children.count }
    return sidebarItems.count
  }

  func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any {
    if let node = item as? SidebarNode { return node.children[index] }
    return sidebarItems[index]
  }

  func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool {
    guard let node = item as? SidebarNode else { return false }
    return !node.children.isEmpty
  }
}

extension NativiteChrome: NSOutlineViewDelegate {
  func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
    guard let node = item as? SidebarNode else { return nil }
    let cellId = NSUserInterfaceItemIdentifier("SidebarCell")
    let cell: NSTableCellView
    if let reused = outlineView.makeView(withIdentifier: cellId, owner: self) as? NSTableCellView {
      cell = reused
    } else {
      cell = NSTableCellView()
      cell.identifier = cellId
      let imgView = NSImageView()
      imgView.translatesAutoresizingMaskIntoConstraints = false
      cell.addSubview(imgView)
      cell.imageView = imgView
      let textField = NSTextField(labelWithString: "")
      textField.translatesAutoresizingMaskIntoConstraints = false
      cell.addSubview(textField)
      cell.textField = textField
      NSLayoutConstraint.activate([
        imgView.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 4),
        imgView.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        imgView.widthAnchor.constraint(equalToConstant: 16),
        imgView.heightAnchor.constraint(equalToConstant: 16),
        textField.leadingAnchor.constraint(equalTo: imgView.trailingAnchor, constant: 6),
        textField.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -4),
        textField.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
      ])
    }
    cell.textField?.stringValue = node.label
    if let iconName = node.icon {
      cell.imageView?.image = NSImage(systemSymbolName: iconName, accessibilityDescription: nil)
    } else {
      cell.imageView?.image = nil
    }
    return cell
  }

  func outlineViewSelectionDidChange(_ notification: Notification) {
    guard let outlineView = notification.object as? NSOutlineView else { return }
    let row = outlineView.selectedRow
    guard row >= 0, let node = outlineView.item(atRow: row) as? SidebarNode else { return }
    sendEvent(name: "sidebarPanel.itemPressed", data: ["id": node.id])
  }
}

// ─── NSWindowDelegate (app windows) ──────────────────────────────────────────

extension NativiteChrome: NSWindowDelegate {
  func windowWillClose(_ notification: Notification) {
    guard let win = notification.object as? NSWindow else { return }
    for (name, appWin) in activeAppWindows where appWin === win {
      activeAppWindows.removeValue(forKey: name)
      childWebViews.removeValue(forKey: name)
      sendEvent(name: "appWindow.dismissed", data: ["name": name])
      break
    }
  }
}

// ─── NSPopoverDelegate ───────────────────────────────────────────────────────

extension NativiteChrome: NSPopoverDelegate {
  func popoverDidClose(_ notification: Notification) {
    guard let popover = notification.object as? NSPopover else { return }
    for (name, p) in activePopovers where p === popover {
      activePopovers.removeValue(forKey: name)
      childWebViews.removeValue(forKey: name)
      sendEvent(name: "popover.dismissed", data: ["name": name])
      break
    }
  }
}

// ─── SidebarNode ─────────────────────────────────────────────────────────────
// Hierarchical data model for the NSOutlineView sidebar.

private class SidebarNode: NSObject {
  let id: String
  let label: String
  let icon: String?
  let badge: String?
  var children: [SidebarNode]

  init(id: String, label: String, icon: String?, badge: String?, children: [SidebarNode]) {
    self.id = id
    self.label = label
    self.icon = icon
    self.badge = badge
    self.children = children
  }

  static func from(_ dict: [String: Any]) -> SidebarNode? {
    guard let id = dict["id"] as? String,
          let label = dict["label"] as? String else { return nil }
    let icon = dict["icon"] as? String
    let badge: String?
    if let b = dict["badge"] as? String { badge = b }
    else if let b = dict["badge"] as? Int { badge = String(b) }
    else { badge = nil }
    let childDicts = dict["children"] as? [[String: Any]] ?? []
    let children = childDicts.compactMap { SidebarNode.from($0) }
    return SidebarNode(id: id, label: label, icon: icon, badge: badge, children: children)
  }
}

// ─── NativiteChildWebViewController ──────────────────────────────────────────
// Hosts a child WKWebView for sheets, drawers, app windows, and popovers.
// Shares the same WKWebsiteDataStore as the primary webview.

private class NativiteChildWebViewController: NSViewController, WKNavigationDelegate {
  weak var chrome: NativiteChrome?
  weak var nativeBridge: NativiteBridge?
  var instanceName: String = "child"
  private(set) var webView: WKWebView!
  private var lastLoadedURL: URL?
  private var pendingSPARoute: String?

  override func loadView() {
    view = NSView(frame: NSRect(x: 0, y: 0, width: 480, height: 400))
    view.wantsLayer = true
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    let config = WKWebViewConfiguration()
    config.websiteDataStore = WKWebsiteDataStore.default()
    config.applicationNameForUserAgent = "Nativite/macos/1.0"
    config.userContentController.addUserScript(WKUserScript(
      source: "window.__nativekit_instance_name__ = \\"\\(instanceName)\\";document.documentElement.setAttribute('data-nk-platform','macos');",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
    if let nativeBridge {
      config.userContentController.addScriptMessageHandler(nativeBridge, contentWorld: .page, name: "nativite")
    }

    webView = WKWebView(frame: view.bounds, configuration: config)
    webView.autoresizingMask = [.width, .height]
    webView.navigationDelegate = self
    #if DEBUG
    if #available(macOS 13.3, *) {
      webView.isInspectable = true
    }
    #endif
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
      if let route = nextSPARoute { applySPARoute(route) }
      return
    }
    pendingSPARoute = nextSPARoute
    lastLoadedURL = absoluteURL
    if absoluteURL.isFileURL {
      let readAccess = baseURL?.deletingLastPathComponent() ?? absoluteURL.deletingLastPathComponent()
      webView.loadFileURL(absoluteURL, allowingReadAccessTo: readAccess)
    } else {
      webView.load(URLRequest(url: absoluteURL))
    }
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
    if let absoluteURL = URL(string: rawURL), absoluteURL.scheme != nil { return absoluteURL }
    let base = baseURL ?? fallbackBaseURL()
    if rawURL.hasPrefix("/"), let base {
      if base.scheme?.lowercased() == "file" {
        if let bundled = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") {
          return bundled
        }
        return base
      }
      guard var components = URLComponents(url: base, resolvingAgainstBaseURL: true) else { return nil }
      if let routeComponents = URLComponents(string: rawURL) {
        components.path = routeComponents.path
        components.query = routeComponents.query
        components.fragment = routeComponents.fragment
      }
      return components.url
    }
    if let base { return URL(string: rawURL, relativeTo: base) }
    return nil
  }

  private func fallbackBaseURL() -> URL? {
    #if DEBUG
    if let raw = UserDefaults.standard.string(forKey: "nativite.dev.url"),
       let url = URL(string: raw) { return url }
    #endif
    return Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist")
  }

  private func pendingFileSPARoute(for rawPath: String, resolvedURL: URL) -> String? {
    guard resolvedURL.isFileURL, rawPath.hasPrefix("/") else { return nil }
    guard let c = URLComponents(string: rawPath) else { return nil }
    if c.query == nil && c.fragment == nil && c.path.contains(".") { return nil }
    var route = c.path.isEmpty ? "/" : c.path
    if let q = c.query, !q.isEmpty { route += "?\\(q)" }
    if let f = c.fragment, !f.isEmpty { route += "#\\(f)" }
    return route
  }

  private func applySPARoute(_ route: String) {
    let payload: [String: Any] = ["route": route]
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else { return }
    let js = "(() => { const p = \\(json); try { window.history.replaceState(window.history.state ?? null, '', p.route); window.dispatchEvent(new PopStateEvent('popstate')); } catch(_){} })();"
    webView.evaluateJavaScript(js, completionHandler: nil)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard let route = pendingSPARoute else { return }
    pendingSPARoute = nil
    applySPARoute(route)
  }
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
