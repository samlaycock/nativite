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

    it("builds native UIMenu from toolbar button state when menu data is present", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func barButtonItem");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  @objc private func barButtonTapped", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("#available(iOS 14.0, *)");
      expect(body).toContain('state["menu"] as? [String: Any]');
      expect(body).toContain("barButtonMenu(");
      expect(body).toContain("primaryAction: nil");
      expect(body).toContain("menu: menu");
    });

    it("supports recursive menu/submenu rendering for toolbar button menus", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("private func barButtonMenu(");
      expect(output).toContain("private func barButtonMenuElement(");
      expect(output).toContain('itemState["submenu"] as? [[String: Any]]');
      expect(output).toContain("UIAction(");
      expect(output).toContain("UIMenu(title: menuTitle");
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

  describe("sheet", () => {
    it("mounts a WKWebView in sheet view controller for URL-driven content", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("import WebKit");
      expect(output).toContain("private(set) var webView: NativiteWebView!");
      expect(output).toContain(
        'config.applicationNameForUserAgent = "Nativite/\\(nkPlatform)/1.0"',
      );
      expect(output).toContain(
        "webView = NativiteWebView(frame: view.bounds, configuration: config)",
      );
      expect(output).toContain("webView.isOpaque = false");
      expect(output).toContain("webView.backgroundColor = .clear");
      expect(output).toContain("webView.scrollView.backgroundColor = .clear");
      expect(output).toContain("webView.lockRootScroll = false");
      expect(output).toContain("webView.scrollView.contentInsetAdjustmentBehavior = .never");
      expect(output).toContain("webView.scrollView.isScrollEnabled = true");
      expect(output).toContain("webView.scrollView.bounces = false");
      expect(output).toContain("webView.scrollView.alwaysBounceVertical = false");
      expect(output).toContain("webView.scrollView.alwaysBounceHorizontal = false");
    });

    it("resolves relative sheet URLs against the main webview URL and loads them", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("func loadURL(_ rawURL: String, relativeTo baseURL: URL?)");
      expect(output).toContain("loadViewIfNeeded()");
      expect(output).toContain("let effectiveBaseURL = baseURL ?? fallbackBaseURL()");
      expect(output).toContain('if rawURL.hasPrefix("/") {');
      expect(output).toContain("return resolveRootPath(rawURL, relativeTo: effectiveBaseURL)");
      expect(output).toContain("URL(string: rawURL, relativeTo: effectiveBaseURL)");
      expect(output).toContain('if let rawURL = state["url"] as? String');
      expect(output).toContain("sheetVC.loadURL(rawURL, relativeTo: vc.webView.url)");
    });

    it("routes root-prefixed sheet URLs to the same host and supports bundled file fallback", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('if baseScheme == "file" {');
      expect(output).toContain("return bundleEntryURL(relativeTo: baseURL)");
      expect(output).toContain(
        "let nextSPARoute = pendingFileSPARoute(for: rawURL, resolvedURL: absoluteURL)",
      );
      expect(output).toContain("pendingSPARoute = nextSPARoute");
      expect(output).toContain("if absoluteURL == lastLoadedURL {");
      expect(output).toContain("applySPARoute(route)");
      expect(output).toContain(
        'window.history.replaceState(window.history.state ?? null, "", payload.route);',
      );
      expect(output).toContain('window.dispatchEvent(new PopStateEvent("popstate"));');
      expect(output).toContain('UserDefaults.standard.string(forKey: "nativite.dev.url")');
      expect(output).toContain(
        'Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist")',
      );
      expect(output).toContain("sheet.prefersScrollingExpandsWhenScrolledToEdge = false");
    });

    it("bootstraps file-based root routes through index.html and applies SPA route updates", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // In production file:// mode, `/sheet` should load index.html and then
      // route internally via history API so SPA routers initialize normally.
      expect(output).toContain("guard resolvedURL.isFileURL else { return nil }");
      expect(output).toContain('guard rawPath.hasPrefix("/") else { return nil }');
      expect(output).toContain("return bundleEntryURL(relativeTo: baseURL)");
      expect(output).toContain("if absoluteURL == lastLoadedURL {");
      expect(output).toContain("if let route = nextSPARoute {");
      expect(output).toContain("applySPARoute(route)");
      expect(output).toContain("guard let route = pendingSPARoute else { return }");
      expect(output).toContain("pendingSPARoute = nil");
      expect(output).toContain(
        'window.history.replaceState(window.history.state ?? null, "", payload.route);',
      );
      expect(output).toContain('window.dispatchEvent(new PopStateEvent("popstate"));');
    });

    it("supports a small sheet detent mapping", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('case "small": return smallDetent()');
      expect(output).toContain('case "small": return smallDetentIdentifier()');
      expect(output).toContain("UISheetPresentationController.Detent.custom");
    });

    it("bridges messages from sheet webview JS to main webview as sheet.message events", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('config.userContentController.add(self, name: "nativiteSheet")');
      expect(output).toContain("sheetVC.nativeBridge = vc.nativiteBridgeHandler()");
      expect(output).toContain(
        'config.userContentController.addScriptMessageHandler(nativeBridge, contentWorld: .page, name: "nativite")',
      );
      expect(output).toContain(
        "const sheetHandler = window.webkit?.messageHandlers?.nativiteSheet;",
      );
      expect(output).toContain("const bridgeHandler = window.webkit?.messageHandlers?.nativite;");
      expect(output).toContain('method: "__chrome_sheet_post_message_to_sheet__",');
      expect(output).toContain('sendEvent(name: "sheet.message", data: ["message": message.body])');
      expect(output).toContain('sendEvent(name: "sheet.loadFailed", data: payload)');
      expect(output).toContain("didFailProvisionalNavigation");
      expect(output).toContain("window.__nativiteSheetReceive");
    });

    it("provides a native entry point to push messages from main webview to sheet webview", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("func postMessageToSheet(_ message: Any?)");
      expect(output).toContain("sheetVC.postMessage(message)");
    });
  });
});
