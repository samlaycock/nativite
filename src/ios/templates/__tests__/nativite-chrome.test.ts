import { describe, expect, it } from "bun:test";

import { baseConfig } from "../../../__tests__/fixtures.ts";
import { nativiteChromeTemplate } from "../nativite-chrome.ts";

describe("nativiteChromeTemplate", () => {
  describe("toolbar button events", () => {
    it("routes toolbar button taps to toolbar.itemTapped, not titleBar events", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const barButtonTappedStart = output.indexOf("func barButtonTapped");
      expect(barButtonTappedStart).toBeGreaterThan(-1);
      const toolbarEventInHandler = output.indexOf('"toolbar.itemPressed"', barButtonTappedStart);
      expect(toolbarEventInHandler).toBeGreaterThan(barButtonTappedStart);
    });

    it("routes leading nav bar buttons to titleBar.leadingItemTapped", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const barButtonTappedStart = output.indexOf("func barButtonTapped");
      const nextMethodStart = output.indexOf("@objc private func", barButtonTappedStart + 1);
      const handlerBody =
        nextMethodStart !== -1
          ? output.slice(barButtonTappedStart, nextMethodStart)
          : output.slice(barButtonTappedStart);

      expect(handlerBody).toContain('"titleBar.leadingItemPressed"');
      expect(handlerBody).toContain('"titleBar.trailingItemPressed"');
      expect(handlerBody).toContain('"toolbar.itemPressed"');
    });

    it("removes the unreachable toolbarButtonTapped dead-code method", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).not.toContain("func toolbarButtonTapped");
    });

    it("uses maxSplits: 1 when parsing the accessibilityIdentifier so button IDs containing colons are preserved", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const barButtonTappedStart = output.indexOf("func barButtonTapped");
      expect(barButtonTappedStart).toBeGreaterThan(-1);
      const nextMethodStart = output.indexOf("\n  private func ", barButtonTappedStart);
      const handlerBody =
        nextMethodStart !== -1
          ? output.slice(barButtonTappedStart, nextMethodStart)
          : output.slice(barButtonTappedStart);

      // Must use maxSplits: 1 to avoid silently dropping events when IDs
      // contain colons (e.g. id: "edit:profile").
      expect(handlerBody).toContain('split(separator: ":", maxSplits: 1)');
      // Must NOT use the bare split without maxSplits (which would break on colon IDs).
      expect(handlerBody).not.toContain('split(separator: ":").');
    });
  });

  describe("title bar button items", () => {
    it("uses leadingItems key for leading nav bar items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["leadingItems"]');
      expect(body).not.toContain('state["toolbarLeft"]');
    });

    it("uses trailingItems key for trailing nav bar items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["trailingItems"]');
      expect(body).not.toContain('state["toolbarRight"]');
    });

    it("uses backLabel key for back button title", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["backLabel"]');
      expect(body).not.toContain('state["backButtonTitle"]');
    });

    it("delegates to toolbarItem() so fixed-space and flexible-space work in nav bar items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("toolbarItem(");
      expect(body).not.toContain("compactMap { barButtonItem($0");
    });

    it("builds native UIMenu from button state when menu data is present", () => {
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

    it("uses icon key instead of systemImage for button icons", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func barButtonItem");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  @objc private func barButtonTapped", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["icon"]');
      expect(body).not.toContain('state["systemImage"]');
    });

    it("uses label key instead of title for button text", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func barButtonItem");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  @objc private func barButtonTapped", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["label"]');
    });

    it("maps primary style to .done, not done style string", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func barButtonItem");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  @objc private func barButtonTapped", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('"primary"');
      expect(body).not.toContain('"done"');
    });

    it("wires non-menu buttons to barButtonTapped via target-action so taps fire events", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func barButtonItem");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  @objc private func barButtonTapped", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // Non-menu buttons must use the old-style target/action init so UIKit
      // calls barButtonTapped when the user taps them.
      expect(body).toContain("target: self, action: #selector(barButtonTapped(_:))");
    });

    it("encodes position and id in accessibilityIdentifier so barButtonTapped can route events", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func barButtonItem");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  @objc private func barButtonTapped", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('accessibilityIdentifier = "\\(position):\\(id)"');
    });

    it("applies 'left' position for leading items and 'right' for trailing so barButtonTapped routes correctly", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // Leading items use "left" and trailing items use "right" — must match the
      // switch cases in barButtonTapped.
      expect(body).toContain('position: "left"');
      expect(body).toContain('position: "right"');
    });

    it("supports recursive menu children rendering for nested menus", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("private func barButtonMenu(");
      expect(output).toContain("private func barButtonMenuElement(");
      expect(output).toContain('itemState["children"] as? [[String: Any]]');
      expect(output).toContain("UIAction(");
    });

    it("fires toolbar.menuItemSelected for toolbar menu items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('"toolbar.menuItemPressed"');
    });
  });

  describe("title bar cleanup", () => {
    it("resetTitleBar hides the nav bar so it returns to its initial state", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func resetTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // The app delegate starts with the nav bar hidden. resetTitleBar must
      // restore that state by hiding it — NOT revealing it.
      expect(body).toContain("setNavigationBarHidden(true,");
      expect(body).not.toContain("setNavigationBarHidden(false,");
    });

    it("resetTitleBar uses animated: true because JS-layer coalescing prevents it being called during a rapid cleanup+re-apply cycle", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func resetTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // The JS chrome() flush is debounced via queueMicrotask: a synchronous
      // cleanup+re-apply (React useEffect dependency change) is coalesced into
      // one native message with the final state, so resetTitleBar is never called
      // in that scenario. When it IS called (genuine unmount), animated: true
      // gives a smooth hide transition.
      expect(body).toContain("setNavigationBarHidden(true, animated: true)");
    });

    it("resetTitleBar clears all nav item properties", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func resetTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("leftBarButtonItems = nil");
      expect(body).toContain("rightBarButtonItems = nil");
      expect(body).toContain("searchController = nil");
    });
  });

  describe("title bar and toolbar default visibility", () => {
    it("applyTitleBar shows the nav bar by default without requiring hidden: false", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).not.toContain('if let hidden = state["hidden"]');
      expect(body).toContain("setNavigationBarHidden");
      expect(body).toContain("?? false");
    });

    it("applyToolbar shows the toolbar by default without requiring hidden: false", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyToolbar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).not.toContain('if let hidden = state["hidden"]');
      expect(body).toContain("setToolbarHidden");
      expect(body).toContain("?? false");
    });

    it("applyTitleBar only calls setNavigationBarHidden when the hidden state has changed to avoid spurious animations", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      // Must guard with isNavigationBarHidden comparison so repeated state flushes
      // (e.g. on every route change) don't produce a slide-in/out animation.
      expect(body).toContain("isNavigationBarHidden");
      expect(body).toContain("setNavigationBarHidden");
    });

    it("applyToolbar only calls setToolbarHidden when the hidden state has changed to avoid spurious animations", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyToolbar");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain("isToolbarHidden");
      expect(body).toContain("setToolbarHidden");
    });
  });

  describe("navigation (tab bar)", () => {
    it("applyNavigation does not guard on tabBarController (always nil in single-WebView architecture)", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigation");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).not.toContain("tabBarController");
    });

    it("NativiteChrome conforms to UITabBarDelegate to receive tab-selection callbacks", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("UITabBarDelegate");
    });

    it("dispatches navigation.itemSelected when the user selects a tab", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('"navigation.itemPressed"');
    });

    it("uses label key instead of title for tab items", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigation");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('itemState["label"]');
      expect(body).not.toContain('itemState["title"]');
    });

    it("uses icon key instead of systemImage for tab icons", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigation");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('itemState["icon"]');
      expect(body).not.toContain('itemState["systemImage"]');
    });

    it("uses activeItem key instead of selectedTabId", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func applyNavigation");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).toContain('state["activeItem"]');
      expect(body).not.toContain('state["selectedTabId"]');
    });

    it("pushVarUpdates reads tab geometry from the owned UITabBar, not tabBarController", () => {
      const output = nativiteChromeTemplate(baseConfig);
      const start = output.indexOf("func pushVarUpdates");
      expect(start).toBeGreaterThan(-1);
      const end = output.indexOf("\n  private func ", start + 1);
      const body = end !== -1 ? output.slice(start, end) : output.slice(start);
      expect(body).not.toContain("tabBarController");
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

    it("supports small, medium, large and full detent mappings", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('"small"');
      expect(output).toContain("smallDetent()");
      expect(output).toContain("smallDetentIdentifier()");
      expect(output).toContain("fullDetent()");
      expect(output).toContain("UISheetPresentationController.Detent.custom");
    });

    it("uses activeDetent key instead of selectedDetent", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('state["activeDetent"]');
      expect(output).not.toContain('state["selectedDetent"]');
    });

    it("uses WKWebsiteDataStore.default() so the sheet webview shares a process with the primary (iOS 15+)", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("config.websiteDataStore = WKWebsiteDataStore.default()");
      expect(output).not.toContain("WKProcessPool");
    });

    it("reads sheet state from 'sheets' dict so named instances are dispatched correctly", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('state["sheets"] as? [String: [String: Any]]');
      expect(output).toContain("for (name, sheetState) in sheets");
      expect(output).toContain("self.applySheet(name: name, state: sheetState)");
      expect(output).not.toContain('state["sheet"] as? [String: Any]');
    });

    it("passes the sheet name to NativiteSheetViewController as instanceName", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('var instanceName: String = "sheet"');
      expect(output).toContain("sheetVC.instanceName = name");
    });

    it("injects the instance name user script so the native message broker can identify this webview", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("window.__nativekit_instance_name__ = ");
      expect(output).toContain("\\(instanceName)");
      expect(output).toContain("injectionTime: .atDocumentStart");
    });

    it("emits sheet.presented event with sheet name when the sheet is presented", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('sendEvent(name: "sheet.presented", data: ["name": name])');
    });

    it("emits sheet.dismissed via presentationControllerDidDismiss, not viewDidDisappear", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // Uses the correct UIAdaptivePresentationControllerDelegate method so the event
      // fires only on actual dismissal — not when another VC is presented over the sheet.
      expect(output).toContain(
        "func presentationControllerDidDismiss(_ presentationController: UIPresentationController)",
      );
      expect(output).toContain('sendEvent(name: "sheet.dismissed", data: ["name": instanceName])');
      // override func viewDidDisappear must NOT be used for sheet.dismissed: it fires on
      // any view-disappearance (e.g. alert or another modal presented over the sheet).
      expect(output).not.toContain("override func viewDidDisappear");
    });

    it("re-sets bridge on reused sheet VC so events keep firing after NativiteChrome re-create", () => {
      const output = nativiteChromeTemplate(baseConfig);
      // When an existing NativiteSheetViewController is reused (sheet already presented),
      // bridge must be re-assigned because the weak var may have gone stale.
      expect(output).toContain(
        "sheetVC.bridge = self // re-set in case NativiteChrome was re-created",
      );
    });

    it("emits sheet.detentChanged event with sheet name and detent", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain(
        'sendEvent(name: "sheet.detentChanged", data: ["name": instanceName, "detent": detent])',
      );
    });

    it("emits sheet.loadFailed event with sheet name", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain('"name": instanceName');
      expect(output).toContain('sendEvent(name: "sheet.loadFailed", data: payload)');
    });

    it("uses receiveMessage to deliver messages to sheet webview via nativiteReceive", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("func receiveMessage(from sender: String, payload: Any?)");
      expect(output).toContain("window.nativiteReceive(");
    });

    it("provides postMessageToChild and broadcastMessage on NativiteChrome", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("func postMessageToChild(name: String, payload: Any?)");
      expect(output).toContain("func broadcastMessage(from sender: String, payload: Any?)");
    });

    it("registers the nativite bridge handler in the sheet webview", () => {
      const output = nativiteChromeTemplate(baseConfig);
      expect(output).toContain("sheetVC.nativeBridge = vc.nativiteBridgeHandler()");
      expect(output).toContain(
        'config.userContentController.addScriptMessageHandler(nativeBridge, contentWorld: .page, name: "nativite")',
      );
      expect(output).toContain("didFailProvisionalNavigation");
    });
  });
});
