import { describe, expect, it } from "bun:test";

import { baseConfig } from "../../../__tests__/fixtures.ts";
import { nativiteChromeTemplate } from "../nativite-chrome.ts";

describe("nativiteChromeTemplate", () => {
  describe("toolbar button events", () => {
    it("routes toolbar button taps to toolbar.buttonTapped, not navigationBar.buttonTapped", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // barButtonTapped is the shared action selector for nav bar and toolbar buttons.
      // Items store their origin in the accessibilityIdentifier as "<position>:<id>",
      // so parts[0] distinguishes toolbar from nav bar buttons.
      // The method must branch on position to fire the correct event.
      const barButtonTappedStart = output.indexOf("func barButtonTapped");
      expect(barButtonTappedStart).toBeGreaterThan(-1);
      const toolbarEventInHandler = output.indexOf('"toolbar.buttonTapped"', barButtonTappedStart);
      expect(toolbarEventInHandler).toBeGreaterThan(barButtonTappedStart);
    });

    it("does not unconditionally send navigationBar.buttonTapped for all button positions", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // Find barButtonTapped method body. The method ends before the next @objc method.
      // If only "navigationBar.buttonTapped" appears (no branch), all toolbar taps
      // would silently fire the wrong event.
      const barButtonTappedStart = output.indexOf("func barButtonTapped");
      const nextMethodStart = output.indexOf("@objc private func", barButtonTappedStart + 1);
      const handlerBody =
        nextMethodStart !== -1
          ? output.slice(barButtonTappedStart, nextMethodStart)
          : output.slice(barButtonTappedStart);

      // The handler must dispatch toolbar.buttonTapped for toolbar-position buttons.
      expect(handlerBody).toContain('"toolbar.buttonTapped"');
    });

    it("removes the unreachable toolbarButtonTapped dead-code method", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // toolbarButtonTapped was a standalone @objc method that was never set as
      // the action on any UIBarButtonItem — it could never be called. It must be
      // removed so the compiler does not emit unused-method warnings.
      expect(output).not.toContain("func toolbarButtonTapped");
    });
  });

  describe("navigation bar button items", () => {
    it("uses toolbarLeft key instead of leftButtons for left nav bar items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["toolbarLeft"]');
      expect(body).not.toContain('state["leftButtons"]');
    });

    it("uses toolbarRight key instead of rightButtons for right nav bar items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["toolbarRight"]');
      expect(body).not.toContain('state["rightButtons"]');
    });

    it("delegates to toolbarItem() so fixedSpace and flexibleSpace work in nav bar items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigationBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // Must use toolbarItem() (which handles flexibleSpace/fixedSpace) not barButtonItem() directly
      expect(body).toContain("toolbarItem(");
      expect(body).not.toContain("compactMap { barButtonItem($0");
    });
  });

  describe("navigation bar and toolbar default visibility", () => {
    it("applyNavigationBar shows the nav bar by default without requiring hidden: false", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // applyNavigationBar guarded setNavigationBarHidden behind
      // `if let hidden = state["hidden"]`, so chrome.navigationBar.setTitle("...")
      // without hidden: false was a complete visual no-op — the nav bar stayed hidden
      // even after the AppDelegate fix that gave us a UINavigationController.
      // The call must now execute unconditionally and default to visible.
      const start = output.indexOf("func applyNavigationBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // Old conditional guard must be gone
      expect(body).not.toContain('if let hidden = state["hidden"]');
      // setNavigationBarHidden must still be present
      expect(body).toContain("setNavigationBarHidden");
      // Must use ?? false so the bar is visible when hidden is absent from state
      expect(body).toContain("?? false");
    });

    it("applyToolbar shows the toolbar by default without requiring hidden: false", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // Same issue as applyNavigationBar: toolbar only appeared if hidden: false was
      // explicitly passed. chrome.toolbar.setItems([...]) was a visual no-op.
      const start = output.indexOf("func applyToolbar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).not.toContain('if let hidden = state["hidden"]');
      expect(body).toContain("setToolbarHidden");
      expect(body).toContain("?? false");
    });
  });

  describe("tab bar", () => {
    it("applyTabBar does not guard on tabBarController (always nil in single-WebView architecture)", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // vc.tabBarController is always nil — no UITabBarController exists in the
      // single-WKWebView architecture. Guarding on it silently skips the entire
      // applyTabBar body, making chrome.tabBar.setTabs(...) a complete no-op.
      const start = output.indexOf("func applyTabBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).not.toContain("tabBarController");
    });

    it("NativiteChrome conforms to UITabBarDelegate to receive tab-selection callbacks", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // UITabBarDelegate is required so NativiteChrome can implement
      // tabBar(_:didSelect:) and fire tabBar.tabSelected events back to JS.
      expect(output).toContain("UITabBarDelegate");
    });

    it("dispatches tabBar.tabSelected when the user selects a tab", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // The UITabBarDelegate callback must fire "tabBar.tabSelected" so the
      // JS layer receives tab-change events.
      expect(output).toContain('"tabBar.tabSelected"');
    });

    it("pushVarUpdates reads tab geometry from the owned UITabBar, not tabBarController", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // pushVarUpdates must not reference tabBarController — always nil.
      // It should instead derive tab height/visibility from the self-owned UITabBar.
      const start = output.indexOf("func pushVarUpdates");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).not.toContain("tabBarController");
    });
  });
});
