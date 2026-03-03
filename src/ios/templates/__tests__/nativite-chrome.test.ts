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
  });

  describe("toolbar spacer items", () => {
    it("uses hyphenated flexible-space and fixed-space type strings", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('"flexible-space"');
      expect(output).toContain('"fixed-space"');
      expect(output).not.toContain('"flexibleSpace"');
      expect(output).not.toContain('"fixedSpace"');
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

    it("injects the instance name user script so the native message broker can identify this webview", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("window.__nativekit_instance_name__ = ");
      expect(output).toContain("\\(instanceName)");
      expect(output).toContain("injectionTime: .atDocumentStart");
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

    describe("NSToolbar (unified titleBar + toolbar)", () => {
      it("creates an NSToolbar with delegate conformance", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private var toolbar: NSToolbar?");
        expect(macos).toContain('NSToolbar(identifier: "NativiteToolbar")');
        expect(macos).toContain("extension NativiteChrome: NSToolbarDelegate");
      });

      it("builds toolbar items from titleBar leading/trailing and toolbar items", () => {
        const macos = getMacosSection();
        expect(macos).toContain("pendingLeadingItems");
        expect(macos).toContain("pendingTrailingItems");
        expect(macos).toContain("pendingToolbarItems");
        expect(macos).toContain("func rebuildToolbarIfNeeded()");
      });

      it("routes toolbar item clicks to correct event areas", () => {
        const macos = getMacosSection();
        expect(macos).toContain("func toolbarItemClicked");
        expect(macos).toContain('"titleBar.leadingItemPressed"');
        expect(macos).toContain('"titleBar.trailingItemPressed"');
        expect(macos).toContain('"toolbar.itemPressed"');
      });

      it("supports NSMenuToolbarItem for items with menus", () => {
        const macos = getMacosSection();
        expect(macos).toContain("NSMenuToolbarItem(itemIdentifier:");
        expect(macos).toContain("func toolbarMenuItemClicked");
        expect(macos).toContain('"titleBar.menuItemPressed"');
      });

      it("includes NSSearchToolbarItem for searchBar", () => {
        const macos = getMacosSection();
        expect(macos).toContain("NSSearchToolbarItem(itemIdentifier:");
        expect(macos).toContain("pendingSearchBar");
      });

      it("implements NSSearchFieldDelegate for search events", () => {
        const macos = getMacosSection();
        expect(macos).toContain("extension NativiteChrome: NSSearchFieldDelegate");
        expect(macos).toContain('"titleBar.searchChanged"');
        expect(macos).toContain('"titleBar.searchSubmitted"');
        expect(macos).toContain('"titleBar.searchCancelled"');
      });
    });

    describe("NSSegmentedControl (navigation)", () => {
      it("creates an NSSegmentedControl lazily", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private var navigationSegmentedControl: NSSegmentedControl?");
        expect(macos).toContain("func applyNavigation");
      });

      it("uses capsule segment style", () => {
        const macos = getMacosSection();
        expect(macos).toContain("seg.segmentStyle = .capsule");
        expect(macos).toContain("seg.trackingMode = .selectOne");
      });

      it("fires navigation.itemPressed on segment selection", () => {
        const macos = getMacosSection();
        expect(macos).toContain("navigationSegmentTapped");
        expect(macos).toContain('"navigation.itemPressed"');
      });

      it("handles hidden state", () => {
        const macos = getMacosSection();
        expect(macos).toContain("navigationContainerView?.isHidden = hidden");
      });

      it("reads the style property", () => {
        const macos = getMacosSection();
        expect(macos).toContain('let style = (state["style"] as? String) ?? "auto"');
      });
    });

    describe("NSSplitViewController (sidebarPanel)", () => {
      it("creates NSSplitViewController with sidebar and detail items", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private var splitViewController: NSSplitViewController?");
        expect(macos).toContain("NSSplitViewItem(sidebarWithViewController:");
      });

      it("uses NSOutlineView as a source list", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private var sidebarOutlineView: NSOutlineView?");
        expect(macos).toContain("outlineView.style = .sourceList");
        expect(macos).toContain("outlineView.dataSource = self");
        expect(macos).toContain("outlineView.delegate = self");
      });

      it("implements NSOutlineViewDataSource and Delegate", () => {
        const macos = getMacosSection();
        expect(macos).toContain("extension NativiteChrome: NSOutlineViewDataSource");
        expect(macos).toContain("extension NativiteChrome: NSOutlineViewDelegate");
        expect(macos).toContain('"sidebarPanel.itemPressed"');
      });

      it("has a SidebarNode model with hierarchical children", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private class SidebarNode: NSObject");
        expect(macos).toContain("var children: [SidebarNode]");
        expect(macos).toContain("static func from(_ dict: [String: Any]) -> SidebarNode?");
      });

      it("toggles sidebar collapse via visible property", () => {
        const macos = getMacosSection();
        expect(macos).toContain("sidebarItem.isCollapsed = !visible");
      });
    });

    describe("sheets", () => {
      it("delegates applySheet to chromeState.updateSheet", () => {
        const macos = getMacosSection();
        expect(macos).toContain("chromeState?.updateSheet(name: name, state: state)");
      });

      it("delegates resetSheets to chromeState.resetSheets", () => {
        const macos = getMacosSection();
        expect(macos).toContain("chromeState?.resetSheets()");
      });

      it("does not contain legacy NSPanel sheet presentation code", () => {
        const macos = getMacosSection();
        expect(macos).not.toContain("private var activeSheets: [String: NSPanel]");
        expect(macos).not.toContain("window.beginSheet(panel)");
        expect(macos).not.toContain("window.endSheet(panel)");
        expect(macos).not.toContain("resolveSheetHeight");
      });
    });

    describe("drawers (NSSplitViewItem)", () => {
      it("creates drawer items as NSSplitViewItems", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private var activeDrawerItems: [String: NSSplitViewItem]");
        expect(macos).toContain('"drawer.presented"');
        expect(macos).toContain('"drawer.dismissed"');
      });

      it("supports leading and trailing side drawers", () => {
        const macos = getMacosSection();
        expect(macos).toContain("NSSplitViewItem(sidebarWithViewController: childVC)");
        expect(macos).toContain("NSSplitViewItem(inspectorWithViewController: childVC)");
      });
    });

    describe("appWindows (NSWindow)", () => {
      it("creates new NSWindow instances", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private var activeAppWindows: [String: NSWindow]");
        expect(macos).toContain('"appWindow.presented"');
        expect(macos).toContain('"appWindow.dismissed"');
      });

      it("supports modal via beginSheet", () => {
        const macos = getMacosSection();
        expect(macos).toContain("vc.view.window?.beginSheet(win)");
      });

      it("implements NSWindowDelegate for close events", () => {
        const macos = getMacosSection();
        expect(macos).toContain("extension NativiteChrome: NSWindowDelegate");
        expect(macos).toContain("func windowWillClose");
      });

      it("supports window properties: title, size, minSize, resizable", () => {
        const macos = getMacosSection();
        expect(macos).toContain("win.title =");
        expect(macos).toContain("win.minSize =");
        expect(macos).toContain("mask.insert(.resizable)");
      });
    });

    describe("popovers (NSPopover)", () => {
      it("creates NSPopover instances", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private var activePopovers: [String: NSPopover]");
        expect(macos).toContain('"popover.presented"');
        expect(macos).toContain('"popover.dismissed"');
      });

      it("resolves anchor element rect via JS evaluation", () => {
        const macos = getMacosSection();
        expect(macos).toContain("anchorElementId");
        expect(macos).toContain("getBoundingClientRect");
        expect(macos).toContain("popover.show(relativeTo:");
      });

      it("implements NSPopoverDelegate", () => {
        const macos = getMacosSection();
        expect(macos).toContain("extension NativiteChrome: NSPopoverDelegate");
        expect(macos).toContain("func popoverDidClose");
      });
    });

    describe("inter-webview messaging", () => {
      it("has a child webview registry", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private var childWebViews: [String: WKWebView]");
      });

      it("implements postMessageToChild with actual delivery", () => {
        const macos = getMacosSection();
        // Ensure the no-op stubs are gone
        expect(macos).not.toContain("{ _ = name; _ = payload }");
        expect(macos).toContain("func postMessageToChild(name: String, payload: Any?)");
        expect(macos).toContain("childWebViews[name]");
      });

      it("implements broadcastMessage to all children", () => {
        const macos = getMacosSection();
        expect(macos).not.toContain("{ _ = sender; _ = payload }");
        expect(macos).toContain("func broadcastMessage(from sender: String, payload: Any?)");
        expect(macos).toContain("for (name, webView) in childWebViews");
      });

      it("implements instanceName lookup from webview reference", () => {
        const macos = getMacosSection();
        // Old no-op stub was: { _ = webView; return "unknown" }
        expect(macos).not.toContain("_ = webView; return");
        expect(macos).toContain("func instanceName(for webView: WKWebView?) -> String");
        expect(macos).toContain("for (name, wv) in childWebViews");
      });
    });

    describe("NativiteChildWebViewController", () => {
      it("exists as a shared child webview host", () => {
        const macos = getMacosSection();
        expect(macos).toContain("private class NativiteChildWebViewController:");
        expect(macos).toContain("WKNavigationDelegate");
      });

      it("shares the default WKWebsiteDataStore", () => {
        const macos = getMacosSection();
        expect(macos).toContain("WKWebsiteDataStore.default()");
      });

      it("injects instance name and platform attribute", () => {
        const macos = getMacosSection();
        expect(macos).toContain("__nativekit_instance_name__");
        expect(macos).toContain("data-nv-platform");
      });

      it("registers the bridge script message handler", () => {
        const macos = getMacosSection();
        expect(macos).toContain(
          'config.userContentController.addScriptMessageHandler(nativeBridge, contentWorld: .page, name: "nativite")',
        );
      });

      it("has SPA route support for file:// URLs", () => {
        const macos = getMacosSection();
        expect(macos).toContain("func applySPARoute");
        expect(macos).toContain("history.replaceState");
      });
    });

    describe("applyState dispatch", () => {
      it("dispatches all chrome areas in applyState", () => {
        const macos = getMacosSection();
        const applyStateBody = macos.slice(
          macos.indexOf("func applyState"),
          macos.indexOf("func pushVarUpdates"),
        );
        expect(applyStateBody).toContain('"titleBar"');
        expect(applyStateBody).toContain('"toolbar"');
        expect(applyStateBody).toContain('"navigation"');
        expect(applyStateBody).toContain('"menuBar"');
        expect(applyStateBody).toContain('"sidebarPanel"');
        expect(applyStateBody).toContain('"sheets"');
        expect(applyStateBody).toContain('"drawers"');
        expect(applyStateBody).toContain('"appWindows"');
        expect(applyStateBody).toContain('"popovers"');
      });
    });

    describe("resetArea", () => {
      it("handles all resettable areas", () => {
        const macos = getMacosSection();
        const resetAreaBody = macos.slice(
          macos.indexOf("func resetArea"),
          macos.indexOf("private func resetTitleBar"),
        );
        expect(resetAreaBody).toContain('"titleBar"');
        expect(resetAreaBody).toContain('"toolbar"');
        expect(resetAreaBody).toContain('"navigation"');
        expect(resetAreaBody).toContain('"menuBar"');
        expect(resetAreaBody).toContain('"sidebarPanel"');
        expect(resetAreaBody).toContain('"sheets"');
        expect(resetAreaBody).toContain('"drawers"');
        expect(resetAreaBody).toContain('"appWindows"');
        expect(resetAreaBody).toContain('"popovers"');
      });

      it("has reset methods for each area", () => {
        const macos = getMacosSection();
        expect(macos).toContain("func resetTitleBar()");
        expect(macos).toContain("func resetToolbar()");
        expect(macos).toContain("func resetNavigation()");
        expect(macos).toContain("func resetMenuBar()");
        expect(macos).toContain("func resetSidebarPanel()");
        expect(macos).toContain("func resetSheets()");
        expect(macos).toContain("func resetDrawers()");
        expect(macos).toContain("func resetAppWindows()");
        expect(macos).toContain("func resetPopovers()");
      });
    });

    describe("title bar window properties", () => {
      it("maps window title, subtitle, separator style, fullSizeContent, hidden", () => {
        const macos = getMacosSection();
        expect(macos).toContain("window.title = title");
        expect(macos).toContain("window.subtitle = subtitle");
        expect(macos).toContain("window.titlebarSeparatorStyle");
        expect(macos).toContain(".fullSizeContentView");
        expect(macos).toContain("window.titleVisibility");
      });
    });

    describe("deferred window state (SwiftUI NSViewControllerRepresentable)", () => {
      it("defers chrome state when view.window is nil and replays via replayPendingState", () => {
        const macos = getMacosSection();
        // applyState should check for nil window and store pendingWindowState
        expect(macos).toContain("pendingWindowState");
        expect(macos).toContain("viewController?.view.window == nil");
        // replayPendingState is called from the ViewController's viewDidLayout
        expect(macos).toContain("func replayPendingState()");
        expect(macos).toContain("applyStateInternal(state)");
      });

      it("still forwards SwiftUI-only state (sheets, alerts) even when window is nil", () => {
        const macos = getMacosSection();
        expect(macos).toContain("applySwiftUIOnlyState(state)");
        // The fallback should forward to chromeState model updates
        const swiftUIOnlyStart = macos.indexOf("func applySwiftUIOnlyState");
        expect(swiftUIOnlyStart).toBeGreaterThan(-1);
        const swiftUIOnlyBody = macos.slice(swiftUIOnlyStart, swiftUIOnlyStart + 1500);
        expect(swiftUIOnlyBody).toContain("chromeState?.updateSheet(");
        expect(swiftUIOnlyBody).toContain("chromeState?.updateTitleBar(");
      });
    });

    describe("sidebar/drawer must not replace window.contentViewController", () => {
      it("applySidebarPanel embeds split view inside ViewController's view, not the window", () => {
        const macos = getMacosSection();
        const sidebarStart = macos.indexOf("func applySidebarPanel");
        expect(sidebarStart).toBeGreaterThan(-1);
        const sidebarBody = macos.slice(sidebarStart, sidebarStart + 2500);
        // Must embed as child VC, not replace contentViewController
        expect(sidebarBody).toContain("vc.addChild(split)");
        expect(sidebarBody).toContain("vc.view.addSubview(split.view)");
        expect(sidebarBody).not.toContain("window.contentViewController = split");
      });

      it("applyDrawer embeds split view inside ViewController's view, not the window", () => {
        const macos = getMacosSection();
        const drawerStart = macos.indexOf("func applyDrawer");
        expect(drawerStart).toBeGreaterThan(-1);
        const drawerBody = macos.slice(drawerStart, drawerStart + 2000);
        // Must embed as child VC, not replace contentViewController
        expect(drawerBody).toContain("vc.addChild(split)");
        expect(drawerBody).toContain("vc.view.addSubview(split.view)");
        expect(drawerBody).not.toContain("window.contentViewController = split");
      });

      it("resetSidebarPanel removes split view from ViewController, not from window", () => {
        const macos = getMacosSection();
        const resetStart = macos.indexOf("func resetSidebarPanel");
        expect(resetStart).toBeGreaterThan(-1);
        const resetBody = macos.slice(resetStart, resetStart + 800);
        expect(resetBody).toContain("split.view.removeFromSuperview()");
        expect(resetBody).toContain("split.removeFromParent()");
        expect(resetBody).not.toContain("window.contentViewController = vc");
      });
    });
  });
});
