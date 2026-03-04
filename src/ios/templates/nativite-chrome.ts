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
import SwiftUI

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
///            └─ NativiteTabBottomAccessoryController
///
/// ## Threading
///
/// All UIKit work is dispatched to the main queue inside applyState(_:).
/// Public helpers like postMessageToChild(name:payload:) must be called
/// from the main thread.

class NativiteChrome: NSObject {

  weak var viewController: ViewController?
  // NativiteVars receives geometry updates after each setState call so it can
  // keep --nv-nav-height, --nv-tab-height etc. in sync with the live UIKit state.
  weak var vars: NativiteVars?
  // NativiteKeyboard handles the input accessory bar and keyboard dismiss mode.
  weak var keyboard: NativiteKeyboard?
  // SwiftUI @Observable model — receives state updates for areas migrated to
  // SwiftUI (sheets, alerts, status bar, home indicator). Set by ViewController.
  var chromeState: NativiteChromeState?
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

      // Wire the event callback so SwiftUI views (NativiteBarButton, etc.)
      // can route user interactions back to the JS bridge.
      if self.chromeState?.onChromeEvent == nil {
        self.chromeState?.onChromeEvent = { [weak self] name, data in
          self?.sendEvent(name: name, data: data)
        }
      }

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
    }
  }

  /// Reads live UIKit geometry (nav bar, tab bar, toolbar heights and
  /// visibility) and forwards them to NativiteVars so the CSS custom
  /// properties (--nv-nav-height, --nv-tab-height, etc.) stay in
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

  /// Applies the titleBar area — delegates to NativiteChromeState so the
  /// SwiftUI NativiteTitleBarModifier (inside NavigationStack) renders the
  /// navigation bar title, buttons, search, and visibility.
  private func applyTitleBar(_ state: [String: Any]) {
    withAnimation(.easeInOut(duration: 0.3)) {
      chromeState?.updateTitleBar(state)
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
    // Sync to SwiftUI observable model.
    chromeState?.updateNavigation(state)

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

    // When the items array is empty, tear down the UITabBarController
    // entirely rather than setting tbc.tabs = [].  Going from zero tabs
    // back to populated tabs can leave the WKWebView behind UIKit's
    // opaque content view — the viewControllerProvider for the
    // auto-selected tab may never fire, so reparentWebView's deferred
    // retry never succeeds and the webview stays invisible until the
    // user manually selects a tab.  Destroying the tbc now means a
    // fresh one is created when items come back, following the
    // well-tested first-appearance path.
    if let items = state["items"] as? [[String: Any]], items.isEmpty {
      if tabBarController != nil {
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
        navigationSearchItemId = nil
      }
      return
    }

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
      // Schedule exactly one deferred retry — but only when there IS a
      // selected tab whose VC hasn't been created yet.  If selectedTab
      // is nil (zero tabs), retrying is pointless and would create an
      // infinite dispatch loop.
      if tbc.selectedTab != nil, !hasPendingReparent {
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

  /// Applies the toolbar area — delegates to NativiteChromeState so the
  /// SwiftUI NativiteToolbarModifier renders the bottom toolbar.
  private func applyToolbar(_ state: [String: Any]) {
    withAnimation(.easeInOut(duration: 0.3)) {
      chromeState?.updateToolbar(state)
    }
  }

  // ── Status Bar ─────────────────────────────────────────────────────────────

  /// Applies the statusBar area — sets the status bar style
  /// ("light" / "dark" / default) and visibility.
  private func applyStatusBar(_ state: [String: Any]) {
    chromeState?.updateStatusBar(state)
    viewController?.setNeedsStatusBarAppearanceUpdate()
  }

  // ── Home Indicator ─────────────────────────────────────────────────────────

  /// Applies the homeIndicator area — controls whether the home
  /// indicator (the bottom swipe affordance) should auto-hide.
  private func applyHomeIndicator(_ state: [String: Any]) {
    chromeState?.updateHomeIndicator(state)
    viewController?.setNeedsUpdateOfHomeIndicatorAutoHidden()
  }

  // ── Sheet ──────────────────────────────────────────────────────────────────

  /// Presents or updates a child webview sheet.
  ///
  /// When presented is true the method either reuses an existing
  /// Delegates sheet presentation to the SwiftUI NativiteSheetModifier
  /// via the @Observable NativiteChromeState model.
  private func applySheet(name: String, state: [String: Any]) {
    chromeState?.updateSheet(name: name, state: state)
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
    guard let webView = chromeState?.childWebViews[name] else { return }
    deliverMessage(to: webView, from: "main", payload: payload)
  }

  /// Broadcasts a message to all webview instances (main + all children).
  /// The sender's own instance is excluded to avoid echo.
  func broadcastMessage(from sender: String, payload: Any?) {
    // Forward to primary webview (via sendEvent) unless sender is "main"
    if sender != "main" {
      sendEvent(name: "message", data: ["from": sender, "payload": payload ?? NSNull()])
    }
    // Forward to all child webviews registered in chromeState except the sender
    if let children = chromeState?.childWebViews {
      for (name, webView) in children where name != sender {
        deliverMessage(to: webView, from: sender, payload: payload)
      }
    }
    tabBottomAccessoryVC?.receiveMessage(from: sender, payload: payload)
  }

  /// Resolves the instance name ("sheet", "tabBottomAccessory", etc.)
  /// for a given WKWebView reference. Used by the bridge to identify which
  /// child originated an incoming message.
  func instanceName(for webView: WKWebView?) -> String {
    guard let webView else { return "unknown" }
    if let children = chromeState?.childWebViews {
      for (name, wv) in children where wv === webView {
        return name
      }
    }
    if let accessoryVC = tabBottomAccessoryVC, accessoryVC.webView === webView {
      return "tabBottomAccessory"
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

  /// Resets the title bar to defaults — delegates to NativiteChromeState
  /// so the SwiftUI modifiers observe the cleared values.
  private func resetTitleBar() {
    withAnimation(.easeInOut(duration: 0.3)) {
      chromeState?.resetTitleBar()
    }
  }

  /// Tears down the navigation area — parks the webview back into
  /// vc.view, removes the UITabBarController (iOS 18+), resets the
  /// tab fingerprint, and hides the legacy tab bar.
  private func resetNavigation() {
    chromeState?.resetNavigation()
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

  /// Resets the toolbar to defaults — delegates to NativiteChromeState
  /// so the SwiftUI modifier observes the cleared values.
  private func resetToolbar() {
    withAnimation(.easeInOut(duration: 0.3)) {
      chromeState?.resetToolbar()
    }
  }

  private func resetStatusBar() {
    chromeState?.resetStatusBar()
    viewController?.setNeedsStatusBarAppearanceUpdate()
  }

  private func resetHomeIndicator() {
    chromeState?.resetHomeIndicator()
    viewController?.setNeedsUpdateOfHomeIndicatorAutoHidden()
  }

  private func resetSheets() {
    chromeState?.resetSheets()
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
    let nvPlatform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
    config.applicationNameForUserAgent = "Nativite/\\(nvPlatform)/1.0"
    config.userContentController.addUserScript(WKUserScript(
      source: "window.__nativekit_instance_name__ = \\"tabBottomAccessory\\";document.documentElement.setAttribute('data-nv-platform','\\(nvPlatform)');",
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

// NativiteChrome reconciles declarative chrome state from JS onto SwiftUI
// state models on macOS. AppKit work is limited to NSWindow title-bar level
// properties that do not yet have full SwiftUI parity.
class NativiteChrome: NSObject {

  weak var viewController: ViewController?
  weak var vars: NativiteVars?
  // SwiftUI @Observable model — receives state updates for all macOS chrome
  // areas (title/toolbar/navigation/sidebar/menu/sheets/drawers/popovers/windows).
  var chromeState: NativiteChromeState?

  private var lastAppliedAreas: Set<String> = []

  // Deferred state while SwiftUI is still attaching this ViewController to an
  // NSWindow. This keeps early chrome state from being dropped.
  private var pendingWindowState: [String: Any]?

  // ── Entry point ────────────────────────────────────────────────────────────

  func applyState(_ args: Any?) {
    guard let state = args as? [String: Any] else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      if self.viewController?.view.window == nil {
        self.pendingWindowState = state
        self.applySwiftUIOnlyState(state)
        return
      }

      self.pendingWindowState = nil
      self.applyStateInternal(state)
    }
  }

  func replayPendingState() {
    guard let state = pendingWindowState else { return }
    pendingWindowState = nil
    applyStateInternal(state)
  }

  private func applySwiftUIOnlyState(_ state: [String: Any]) {
    if let titleBarState = state["titleBar"] as? [String: Any] {
      chromeState?.updateTitleBar(titleBarState)
    }
    if let toolbarState = state["toolbar"] as? [String: Any] {
      chromeState?.updateToolbar(toolbarState)
    }
    if let navigationState = state["navigation"] as? [String: Any] {
      chromeState?.updateNavigation(navigationState)
    }
    if let menuBarState = state["menuBar"] as? [String: Any] {
      chromeState?.updateMenuBar(menuBarState)
    }
    if let sidebarPanelState = state["sidebarPanel"] as? [String: Any] {
      chromeState?.updateSidebarPanel(sidebarPanelState)
    }
    if let sheets = state["sheets"] as? [String: [String: Any]] {
      for (name, sheetState) in sheets {
        chromeState?.updateSheet(name: name, state: sheetState)
      }
    }
    if let drawers = state["drawers"] as? [String: [String: Any]] {
      for (name, drawerState) in drawers {
        chromeState?.updateDrawer(name: name, state: drawerState)
      }
    }
    if let appWindows = state["appWindows"] as? [String: [String: Any]] {
      for (name, windowState) in appWindows {
        chromeState?.updateAppWindow(name: name, state: windowState)
      }
    }
    if let popovers = state["popovers"] as? [String: [String: Any]] {
      for (name, popoverState) in popovers {
        chromeState?.updatePopover(name: name, state: popoverState)
      }
    }
  }

  private func applyStateInternal(_ state: [String: Any]) {
    if self.chromeState?.onChromeEvent == nil {
      self.chromeState?.onChromeEvent = { [weak self] name, data in
        self?.sendEvent(name: name, data: data)
      }
    }

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

    self.pushVarUpdates()
  }

  private func pushVarUpdates() {
    guard let window = viewController?.view.window else { return }
    let titlebarHeight = window.frame.height - window.contentLayoutRect.height
    let titleBarVisible = !(chromeState?.titleBarHidden ?? false)
    let hasNavigation = navigationIsVisible()
    let tabHeight: CGFloat = hasNavigation ? 36 : 0

    vars?.updateChrome(
      navHeight: titleBarVisible ? titlebarHeight : 0,
      navVisible: titleBarVisible,
      tabHeight: tabHeight,
      tabVisible: hasNavigation,
      toolbarHeight: 0,
      toolbarVisible: false
    )
  }

  private func navigationIsVisible() -> Bool {
    guard let chromeState else { return false }
    if chromeState.navigationStyle == "sidebar" { return false }
    if chromeState.navigationHidden { return false }
    return chromeState.navigationItems.contains(where: { !$0.hidden })
  }

  // ── Inter-webview messaging ────────────────────────────────────────────────

  func postMessageToChild(name: String, payload: Any?) {
    guard let webView = chromeState?.childWebViews[name] else { return }
    deliverMessage(to: webView, from: "main", payload: payload)
  }

  func broadcastMessage(from sender: String, payload: Any?) {
    if sender != "main" {
      sendEvent(name: "message", data: ["from": sender, "payload": payload ?? NSNull()])
    }

    for (name, webView) in chromeState?.childWebViews ?? [:] where name != sender {
      deliverMessage(to: webView, from: sender, payload: payload)
    }
  }

  func instanceName(for webView: WKWebView?) -> String {
    guard let webView else { return "unknown" }
    for (name, wv) in chromeState?.childWebViews ?? [:] where wv === webView {
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
  // ── Title Bar ──────────────────────────────────────────────────────────────

  private func applyTitleBar(_ state: [String: Any]) {
    chromeState?.updateTitleBar(state)
    applyWindowTitleBarProperties(from: state)
  }

  private func applyWindowTitleBarProperties(from state: [String: Any]) {
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
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  private func applyToolbar(_ state: [String: Any]) {
    chromeState?.updateToolbar(state)
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  private func applyNavigation(_ state: [String: Any]) {
    chromeState?.updateNavigation(state)
  }

  // ── Menu Bar ───────────────────────────────────────────────────────────────

  private func applyMenuBar(_ state: [String: Any]) {
    chromeState?.updateMenuBar(state)
  }

  // ── Sidebar Panel ──────────────────────────────────────────────────────────

  private func applySidebarPanel(_ state: [String: Any]) {
    chromeState?.updateSidebarPanel(state)
  }

  // ── Sheet ──────────────────────────────────────────────────────────────────

  private func applySheet(name: String, state: [String: Any]) {
    chromeState?.updateSheet(name: name, state: state)
  }

  // ── Drawer ─────────────────────────────────────────────────────────────────

  private func applyDrawer(name: String, state: [String: Any]) {
    chromeState?.updateDrawer(name: name, state: state)
  }

  // ── App Window ─────────────────────────────────────────────────────────────

  private func applyAppWindow(name: String, state: [String: Any]) {
    chromeState?.updateAppWindow(name: name, state: state)
  }

  // ── Popover ────────────────────────────────────────────────────────────────

  private func applyPopover(name: String, state: [String: Any]) {
    chromeState?.updatePopover(name: name, state: state)
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
    chromeState?.resetTitleBar()
    guard let window = viewController?.view.window else { return }
    window.title = ""
    window.subtitle = ""
    window.titlebarSeparatorStyle = .automatic
    window.titleVisibility = .visible
    window.styleMask.remove(.fullSizeContentView)
    window.titlebarAppearsTransparent = false
  }

  private func resetToolbar() {
    chromeState?.resetToolbar()
  }

  private func resetNavigation() {
    chromeState?.resetNavigation()
  }

  private func resetMenuBar() {
    chromeState?.resetMenuBar()
  }

  private func resetSidebarPanel() {
    chromeState?.resetSidebarPanel()
  }

  private func resetSheets() {
    chromeState?.resetSheets()
  }

  private func resetDrawers() {
    chromeState?.resetDrawers()
  }

  private func resetAppWindows() {
    chromeState?.resetAppWindows()
  }

  private func resetPopovers() {
    chromeState?.resetPopovers()
  }
${sendEventMethod}
}
`;
  return `${iosChrome}

${macosChrome}
#endif
`;
}
