import { describe, expect, it } from "bun:test";

import { baseConfig } from "../../../__tests__/fixtures.ts";
import { nativiteChromeTemplate } from "../nativite-chrome.ts";

describe("nativiteChromeTemplate", () => {
  describe("iOS title bar — SwiftUI delegation", () => {
    it("applyTitleBar delegates to chromeState.updateTitleBar", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ──", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start, start + 300);
      expect(body).toContain("chromeState?.updateTitleBar(state)");
    });

    it("applyTitleBar does not use UINavigationItem or UIBarButtonItem", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ──", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start, start + 300);
      // No UIKit navigation bar manipulation — all handled by SwiftUI
      expect(body).not.toContain("navItem");
      expect(body).not.toContain("navigationController");
      expect(body).not.toContain("setNavigationBarHidden");
      expect(body).not.toContain("UIBarButtonItem");
    });

    it("resetTitleBar delegates to chromeState.resetTitleBar", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func resetTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start, start + 300);
      expect(body).toContain("chromeState?.resetTitleBar()");
    });

    it("resetTitleBar does not touch UIKit navigation bar", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func resetTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start, start + 300);
      expect(body).not.toContain("setNavigationBarHidden");
      expect(body).not.toContain("setLeftBarButtonItems");
      expect(body).not.toContain("setRightBarButtonItems");
      expect(body).not.toContain("barItemCache");
    });

    it("no longer contains UIBarButtonItem building code", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // iOS section only (before #elseif os(macOS))
      const macStart = output.indexOf("#elseif os(macOS)");
      const iosSection = output.slice(0, macStart);
      expect(iosSection).not.toContain("func barButtonItem(");
      expect(iosSection).not.toContain("func barButtonMenu(");
      expect(iosSection).not.toContain("func barButtonMenuElement(");
      expect(iosSection).not.toContain("func barButtonTapped(");
      expect(iosSection).not.toContain("barItemCache");
    });

    it("no longer contains legacy applySearchBar method for title bar", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const macStart = output.indexOf("#elseif os(macOS)");
      const iosSection = output.slice(0, macStart);
      // The title bar search bar is now handled by SwiftUI's .searchable() modifier.
      // UISearchController still exists in the navigation legacy path for search-role tabs.
      expect(iosSection).not.toContain("func applySearchBar(");
    });
  });

  describe("iOS toolbar — SwiftUI delegation", () => {
    it("applyToolbar delegates to chromeState.updateToolbar", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyToolbar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ──", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start, start + 300);
      expect(body).toContain("chromeState?.updateToolbar(state)");
    });

    it("applyToolbar does not use UINavigationController toolbar", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyToolbar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ──", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start, start + 300);
      expect(body).not.toContain("setToolbarHidden");
      expect(body).not.toContain("setToolbarItems");
      expect(body).not.toContain("navigationController");
    });

    it("resetToolbar delegates to chromeState.resetToolbar", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func resetToolbar");
      expect(start).toBeGreaterThan(-1);
      const body = output.slice(start, start + 200);
      expect(body).toContain("chromeState?.resetToolbar()");
    });

    it("no legacy toolbarButtonTapped dead-code method", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).not.toContain("func toolbarButtonTapped");
    });
  });

  describe("iOS onChromeEvent callback wiring", () => {
    it("wires onChromeEvent in applyState so SwiftUI views can send events", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyState");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ── Title", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start, start + 800);
      expect(body).toContain("chromeState?.onChromeEvent == nil");
      expect(body).toContain("self?.sendEvent(name: name, data: data)");
    });
  });

  describe("navigation (tab bar) — legacy path", () => {
    it("applyNavigationLegacy does not reference tabBarController", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationLegacy");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ── Navigation: Modern", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).not.toContain("tabBarController");
    });

    it("NativiteChrome conforms to UITabBarDelegate for the legacy tab-selection path", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("UITabBarDelegate");
    });

    it("dispatches navigation.itemPressed when the user selects a tab", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('"navigation.itemPressed"');
    });

    it("uses label key instead of title for tab items in legacy path", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationLegacy");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ── Navigation: Modern", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('itemState["label"]');
      expect(body).not.toContain('itemState["title"]');
    });

    it("uses icon key instead of systemImage for tab icons in legacy path", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationLegacy");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ── Navigation: Modern", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('itemState["icon"]');
      expect(body).not.toContain('itemState["systemImage"]');
    });

    it("uses activeItem key instead of selectedTabId in legacy path", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationLegacy");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ── Navigation: Modern", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["activeItem"]');
      expect(body).not.toContain('state["selectedTabId"]');
    });
  });

  describe("navigation (tab bar) — modern path (iOS 18+)", () => {
    it("branches on #available(iOS 18.0, *) in applyNavigation", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigation(");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  // ── Navigation: Legacy", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("#available(iOS 18.0, *)");
      expect(body).toContain("applyNavigationModern");
      expect(body).toContain("applyNavigationLegacy");
    });

    it("creates UITabBarController as child VC directly on vc.view", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("UITabBarController()");
      expect(body).not.toContain("PassThroughView");
      expect(body).toContain("addChild(tbc)");
      expect(body).toContain("vc.view.addSubview(tbc.view)");
      expect(body).toContain("didMove(toParent: vc)");
    });

    it("uses UITab for regular items and UISearchTab for search-role items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("UITab(title:");
      expect(body).toContain("UISearchTab(viewControllerProvider:");
    });

    it("enables automaticallyActivatesSearch on iOS 26+ when searchBar is configured", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("#available(iOS 26.0, *), hasSearchBar");
      expect(body).toContain("automaticallyActivatesSearch = true");
    });

    it("maps minimizeBehavior to UITabBarController.tabBarMinimizeBehavior on iOS 26+", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("#available(iOS 26.0, *)");
      expect(body).toContain('state["minimizeBehavior"] as? String');
      expect(body).toContain("tbc.tabBarMinimizeBehavior = .automatic");
      expect(body).toContain("tbc.tabBarMinimizeBehavior = .never");
      expect(body).toContain("tbc.tabBarMinimizeBehavior = .onScrollDown");
      expect(body).toContain("tbc.tabBarMinimizeBehavior = .onScrollUp");
    });

    it("maps style property to UITabBarController.Mode", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("tbc.mode = .tabBar");
      expect(body).toContain("tbc.mode = .tabSidebar");
      expect(body).toContain("tbc.mode = .automatic");
    });

    it("reads subtitle from item state and maps to UITab.subtitle", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('itemState["subtitle"]');
    });

    it("uses selectedTab for active item instead of selectedItem", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("tbc.selectedTab = tab");
    });

    it("conforms to UITabBarControllerDelegate with @available(iOS 18.0, *)", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("@available(iOS 18.0, *)");
      expect(output).toContain("UITabBarControllerDelegate");
      expect(output).toContain("didSelectTab selectedTab: UITab");
    });

    it("handles UISearchTab search events through willBeginSearch and willEndSearch", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("willBeginSearch searchController: UISearchController");
      expect(output).toContain("willEndSearch searchController: UISearchController");
    });

    it("uses UISearchResultsUpdating for search text change events", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("UISearchResultsUpdating");
      expect(output).toContain("updateSearchResults(for searchController:");
      expect(output).toContain("searchController.searchResultsUpdater = self");
    });

    it("sets isNavigationSearchActive flag in willBeginSearch and clears in willEndSearch", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const beginStart = output.indexOf("willBeginSearch");
      expect(beginStart).toBeGreaterThan(-1);
      const beginEnd = output.indexOf("\n  func tabBarController", beginStart + 1);
      const beginBody =
        beginEnd !== -1 ? output.slice(beginStart, beginEnd) : output.slice(beginStart);
      expect(beginBody).toContain("isNavigationSearchActive = true");

      const endStart = output.indexOf("willEndSearch");
      expect(endStart).toBeGreaterThan(-1);
      const endEnd = output.indexOf("\n}", endStart + 1);
      const endBody = endEnd !== -1 ? output.slice(endStart, endEnd) : output.slice(endStart);
      expect(endBody).toContain("isNavigationSearchActive = false");
    });

    it("skips tab rebuild in applyNavigationModern when search is active", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("if isNavigationSearchActive");
    });

    it("applies pending search bar config in willBeginSearch", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("willBeginSearch");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  func tabBarController", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("pendingSearchBarConfig");
      expect(body).toContain("searchController.searchBar.delegate = self");
    });

    it("restores previous tab and fires searchCancelled in willEndSearch", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("willEndSearch");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n}", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("lastNonSearchTabId");
      expect(body).toContain("tbc.selectedTab = tab");
      expect(body).toContain('"navigation.searchCancelled"');
    });

    it("reparents WKWebView into selected tab VC with tracked Auto Layout constraints", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func reparentWebView(to tbc: UITabBarController)");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("tbc.selectedTab?.viewController");
      // Deactivates old constraints before activating new ones.
      expect(body).toContain("NSLayoutConstraint.deactivate(webViewReparentConstraints)");
      // Only moves the webview when it isn't already in the right superview.
      expect(body).toContain("webView.superview !== target.view");
      expect(body).toContain("target.view.insertSubview(webView, at: 0)");
      // Must use Auto Layout (not frame + autoresizingMask) because the
      // target VC's view may have zero bounds when first created by the
      // viewControllerProvider.
      expect(body).toContain("translatesAutoresizingMaskIntoConstraints = false");
      expect(body).toContain(
        "webView.leadingAnchor.constraint(equalTo: target.view.leadingAnchor)",
      );
      expect(body).toContain("webView.topAnchor.constraint(equalTo: target.view.topAnchor)");
      // Stores activated constraints for future deactivation.
      expect(body).toContain("webViewReparentConstraints = constraints");
    });

    it("defers reparent when selected tab VC is nil after a rebuild", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func reparentWebView(to tbc: UITabBarController)");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // When the selected tab VC is nil (lazy viewControllerProvider not
      // yet called by UIKit), the webview is temporarily placed in tbc.view.
      expect(body).toContain("webView.superview !== tbc.view");
      expect(body).toContain("tbc.view.insertSubview(webView, at: 0)");
      // Schedules exactly one deferred retry via DispatchQueue.main.async.
      expect(body).toContain("hasPendingReparent");
      expect(body).toContain("DispatchQueue.main.async");
      expect(body).toContain("self.reparentWebView(to: tbc)");
    });

    it("uses parkWebView helper to move WKWebView back to vc.view", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func parkWebView()");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Moves the primary WKWebView into", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // Deactivates tracked reparent constraints before switching to frame layout.
      expect(body).toContain("NSLayoutConstraint.deactivate(webViewReparentConstraints)");
      expect(body).toContain("webView.superview !== vc.view");
      expect(body).toContain("vc.view.insertSubview(webView, at: 0)");
      expect(body).toContain("translatesAutoresizingMaskIntoConstraints = true");
    });

    it("fingerprints tab structure and only rebuilds when it changes", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Moves the WKWebView back", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // Computes a structural fingerprint from item IDs and roles.
      expect(body).toContain("newFingerprint != tabFingerprint");
      // Full rebuild path parks webview first.
      expect(body).toContain("parkWebView()");
      expect(body).toContain("tbc.tabs = tabs");
      expect(body).toContain("tabFingerprint = newFingerprint");
      // In-place update path updates mutable properties only.
      expect(body).toContain("tab.title = label");
      expect(body).toContain("tab.badgeValue = badge");
    });

    it("reparents webview when tabs are rebuilt or selection changes", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Moves the WKWebView back", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // Captures selection before and after activeItem handling.
      expect(body).toContain("let selectionBefore");
      expect(body).toContain("let selectionAfter");
      // Reparent is gated behind rebuild or selection change.
      expect(body).toContain("didRebuildTabs || selectionAfter != selectionBefore");
      expect(body).toContain("reparentWebView(to: tbc)");
    });

    it("reparents WKWebView on tab selection change", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("didSelectTab selectedTab: UITab");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  func tabBarController", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("reparentWebView(to: tabBarController)");
    });

    it("resetNavigation uses parkWebView, resets fingerprint, cancels deferred reparent, and tears down UITabBarController", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func resetNavigation");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func resetToolbar", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("parkWebView()");
      expect(body).toContain("tabFingerprint = []");
      expect(body).toContain("hasPendingReparent = false");
      expect(body).toContain("willMove(toParent: nil)");
      expect(body).toContain("removeFromParent()");
      expect(body).toContain("tabBarController = nil");
    });

    it("pushVarUpdates reads tab height from UITabBarController when available", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func pushVarUpdates");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n${" + "applyInitialStateMethod}");
      const body = end !== -1 ? output.slice(start, end) : output.slice(start, start + 500);
      expect(body).toContain("tabBarController");
      expect(body).toContain("tbc.tabBar.frame.height");
    });

    it("isNavigationSearchBar recognises both legacy and modern search bars", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("func isNavigationSearchBar");
      expect(output).toContain("navigationSearchController?.searchBar");
      expect(output).toContain("tabBarController != nil");
    });

    it("tears down UITabBarController when items array is empty", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationModern");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Moves the WKWebView back", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // When items is empty, the tbc should be torn down entirely rather
      // than setting tbc.tabs = [] (which causes UIKit quirks on
      // empty → populated transitions that leave the webview invisible).
      expect(body).toContain("items.isEmpty");
      expect(body).toContain("tabBarController = nil");
    });

    it("reparentWebView only retries when selectedTab exists but VC is nil", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func reparentWebView(to tbc: UITabBarController)");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  /// Returns true", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // The deferred retry should only fire when there IS a selected tab
      // whose VC hasn't been created yet. When selectedTab is nil (zero
      // tabs), retrying is pointless and creates an infinite loop.
      expect(body).toContain("tbc.selectedTab != nil");
    });
  });

  describe("tab bottom accessory", () => {
    it("applyState handles tabBottomAccessory key", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('state["tabBottomAccessory"] as? [String: Any]');
      expect(output).toContain("self.applyTabBottomAccessory(tabBottomAccessory)");
    });

    it("applyTabBottomAccessory reads presented, url, and backgroundColor from state", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTabBottomAccessory");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func resetTabBottomAccessory", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["presented"] as? Bool');
      expect(body).toContain('state["url"] as? String');
      expect(body).toContain('state["backgroundColor"] as? String');
    });

    it("installs accessory as child VC with auto layout constraints", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTabBottomAccessory");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func resetTabBottomAccessory", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("vc.addChild(accessoryVC)");
      expect(body).toContain("translatesAutoresizingMaskIntoConstraints = false");
      expect(body).toContain("vc.view.addSubview(accessoryVC.view)");
      expect(body).toContain("accessoryVC.didMove(toParent: vc)");
    });

    it("positions accessory above tab bar when available", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTabBottomAccessory");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func resetTabBottomAccessory", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("tbc.tabBar.topAnchor");
      expect(body).toContain("tabBar.topAnchor");
      expect(body).toContain("vc.view.safeAreaLayoutGuide.bottomAnchor");
    });

    it("emits tabBottomAccessory.presented event", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('sendEvent(name: "tabBottomAccessory.presented", data: [:])');
    });

    it("emits tabBottomAccessory.dismissed event when removing", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('sendEvent(name: "tabBottomAccessory.dismissed", data: [:])');
    });

    it("tears down child VC when presented is false", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTabBottomAccessory");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func resetTabBottomAccessory", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("willMove(toParent: nil)");
      expect(body).toContain("removeFromSuperview()");
      expect(body).toContain("removeFromParent()");
      expect(body).toContain("tabBottomAccessoryVC = nil");
    });

    it("resetArea handles tabBottomAccessory case", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func resetArea");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func resetTitleBar", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('"tabBottomAccessory"');
      expect(body).toContain("resetTabBottomAccessory()");
    });

    it("postMessageToChild routes to tab bottom accessory when name matches", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func postMessageToChild");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  func broadcastMessage", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('"tabBottomAccessory"');
      expect(body).toContain("tabBottomAccessoryVC?.receiveMessage");
    });

    it("broadcastMessage forwards to tab bottom accessory", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func broadcastMessage");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  func instanceName(for", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("tabBottomAccessoryVC?.receiveMessage");
    });

    it("instanceName(for:) recognises tab bottom accessory webview", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func instanceName(for");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func sheetDetent", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("tabBottomAccessoryVC");
      expect(body).toContain('"tabBottomAccessory"');
    });

    it("NativiteTabBottomAccessoryController hosts a WKWebView with shared data store", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("class NativiteTabBottomAccessoryController: UIViewController");
      expect(output).toContain("WKNavigationDelegate");
    });

    it("tab bottom accessory emits loadFailed event with message and code", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain(
        'bridge?.sendEvent(name: "tabBottomAccessory.loadFailed", data: payload)',
      );
    });

    it("tab bottom accessory webview disables scrolling", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // Find the TabBottomAccessoryController section specifically
      const start = output.indexOf("class NativiteTabBottomAccessoryController");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("// ─── UIColor hex extension", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("webView.scrollView.isScrollEnabled = false");
    });
  });

  describe("sheet", () => {
    it("delegates applySheet to chromeState.updateSheet", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("chromeState?.updateSheet(name: name, state: state)");
    });

    it("delegates resetSheets to chromeState.resetSheets", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("chromeState?.resetSheets()");
    });

    it("reads sheet state from 'sheets' dict so named instances are dispatched correctly", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('state["sheets"] as? [String: [String: Any]]');
      expect(output).toContain("for (name, sheetState) in sheets");
      expect(output).toContain("self.applySheet(name: name, state: sheetState)");
      expect(output).not.toContain('state["sheet"] as? [String: Any]');
    });

    it("uses WKWebsiteDataStore.default() so the sheet webview shares a process with the primary (iOS 15+)", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("config.websiteDataStore = WKWebsiteDataStore.default()");
      expect(output).not.toContain("WKProcessPool");
    });

    it("no longer builds generic child-webview instance-name scripts in nativite-chrome (handled by nativite-chrome-state)", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).not.toContain("\\(instanceName)");
    });

    it("uses deliverMessage to send messages to child webviews via nativiteReceive", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain(
        "private func deliverMessage(to webView: WKWebView, from sender: String, payload: Any?)",
      );
      expect(output).toContain("window.nativiteReceive(");
    });

    it("provides postMessageToChild and broadcastMessage on NativiteChrome", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("func postMessageToChild(name: String, payload: Any?)");
      expect(output).toContain("func broadcastMessage(from sender: String, payload: Any?)");
    });

    it("uses chromeState.childWebViews for messaging instead of NativiteSheetViewController", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // iOS messaging should use chromeState?.childWebViews for lookups
      expect(output).toContain("chromeState?.childWebViews[name]");
      expect(output).toContain("chromeState?.childWebViews");
      // NativiteSheetViewController should not exist
      expect(output).not.toContain("class NativiteSheetViewController");
    });

    it("does not contain legacy UIKit sheet presentation code", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).not.toContain("UISheetPresentationController.Detent.custom");
      expect(output).not.toContain("smallDetent()");
      expect(output).not.toContain("fullDetent()");
      expect(output).not.toContain("sheetVC.instanceName");
      expect(output).not.toContain("presentationControllerDidDismiss");
    });
  });

  // ─── macOS Chrome ──────────────────────────────────────────────────────────

  describe("macOS Chrome", () => {
    function getMacosSection(config = baseConfig): string {
      const output = nativiteChromeTemplate(config);
      const macosStart = output.indexOf("#elseif os(macOS)");
      expect(macosStart).toBeGreaterThan(-1);
      return output.slice(macosStart);
    }

    it("delegates all macOS areas to chromeState updates", () => {
      const macos = getMacosSection();
      expect(macos).toContain("chromeState?.updateTitleBar(state)");
      expect(macos).toContain("chromeState?.updateToolbar(state)");
      expect(macos).toContain("chromeState?.updateNavigation(state)");
      expect(macos).toContain("chromeState?.updateMenuBar(state)");
      expect(macos).toContain("chromeState?.updateSidebarPanel(state)");
      expect(macos).toContain("chromeState?.updateSheet(name: name, state: state)");
      expect(macos).toContain("chromeState?.updateDrawer(name: name, state: state)");
      expect(macos).toContain("chromeState?.updateAppWindow(name: name, state: state)");
      expect(macos).toContain("chromeState?.updatePopover(name: name, state: state)");
    });

    it("retains only window-level AppKit title bar mapping", () => {
      const macos = getMacosSection();
      expect(macos).toContain("window.title = title");
      expect(macos).toContain("window.subtitle = subtitle");
      expect(macos).toContain("window.titlebarSeparatorStyle");
      expect(macos).toContain("window.titleVisibility");
      expect(macos).toContain(".fullSizeContentView");
    });

    it("removes legacy AppKit control/delegate implementations", () => {
      const macos = getMacosSection();
      expect(macos).not.toContain("NSSegmentedControl");
      expect(macos).not.toContain("NSSplitViewController");
      expect(macos).not.toContain("NSOutlineView");
      expect(macos).not.toContain("NSMenu(title:");
      expect(macos).not.toContain("NSPopover");
      expect(macos).not.toContain("private class NativiteChildWebViewController");
      expect(macos).not.toContain("extension NativiteChrome: NSWindowDelegate");
      expect(macos).not.toContain("extension NativiteChrome: NSPopoverDelegate");
    });

    it("uses chromeState.childWebViews for inter-webview messaging", () => {
      const macos = getMacosSection();
      expect(macos).toContain("chromeState?.childWebViews[name]");
      expect(macos).toContain("for (name, webView) in chromeState?.childWebViews ?? [:]");
      expect(macos).toContain("for (name, wv) in chromeState?.childWebViews ?? [:]");
    });

    it("still supports deferred window-state replay", () => {
      const macos = getMacosSection();
      expect(macos).toContain("pendingWindowState");
      expect(macos).toContain("viewController?.view.window == nil");
      expect(macos).toContain("func replayPendingState()");
      expect(macos).toContain("applySwiftUIOnlyState(state)");
    });

    it("derives css chrome vars from window geometry and state visibility", () => {
      const macos = getMacosSection();
      const body = macos.slice(
        macos.indexOf("func pushVarUpdates"),
        macos.indexOf("private func navigationIsVisible"),
      );
      expect(body).toContain("titlebarHeight");
      expect(body).toContain("navigationIsVisible()");
      expect(body).toContain("tabHeight: tabHeight");
      expect(body).toContain("toolbarHeight: 0");
      expect(body).toContain("toolbarVisible: false");
    });

    it("resets all supported areas through chromeState reset helpers", () => {
      const macos = getMacosSection();
      expect(macos).toContain("func resetTitleBar()");
      expect(macos).toContain("chromeState?.resetTitleBar()");
      expect(macos).toContain("chromeState?.resetToolbar()");
      expect(macos).toContain("chromeState?.resetNavigation()");
      expect(macos).toContain("chromeState?.resetMenuBar()");
      expect(macos).toContain("chromeState?.resetSidebarPanel()");
      expect(macos).toContain("chromeState?.resetSheets()");
      expect(macos).toContain("chromeState?.resetDrawers()");
      expect(macos).toContain("chromeState?.resetAppWindows()");
      expect(macos).toContain("chromeState?.resetPopovers()");
    });
  });
});
