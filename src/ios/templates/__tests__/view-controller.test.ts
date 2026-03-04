import { describe, expect, it } from "bun:test";

import { baseConfig } from "../../../__tests__/fixtures.ts";
import { viewControllerTemplate } from "../view-controller.ts";

describe("viewControllerTemplate", () => {
  it("does not crash when embedded manifest metadata is missing or invalid", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain(
      'print("[Nativite] Warning: Missing embedded dist/manifest.json. Build the web bundle first.")',
    );
    expect(output).toContain(
      'print("[Nativite] Warning: Invalid embedded dist/manifest.json. Rebuild the web bundle.")',
    );
    expect(output).not.toContain("fatalError(");
  });

  it("treats ipad and ios bundle metadata as compatible on iOS", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain('let compatiblePlatforms: Set<String> = ["ios", "ipad"]');
    expect(output).toContain('let expectedPlatformDescription = "ios or ipad"');
  });

  it("falls back to bundled dev.json when launch env vars are unavailable", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain('Bundle.main.url(forResource: "dev", withExtension: "json")');
    expect(output).toContain('json["devURL"] as? String');
  });

  it("persists env-provided dev URL so relaunches keep using the same server", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain('let devURLDefaultsKey = "nativite.dev.url"');
    expect(output).toContain("UserDefaults.standard.set(envValue, forKey: devURLDefaultsKey)");
  });

  it("checks persisted dev URL before falling back to bundled dev.json", () => {
    const output = viewControllerTemplate(baseConfig);
    const persistedLookupIndex = output.indexOf(
      "UserDefaults.standard.string(forKey: devURLDefaultsKey)",
    );
    const bundledConfigIndex = output.indexOf(
      'Bundle.main.url(forResource: "dev", withExtension: "json")',
    );

    expect(persistedLookupIndex).toBeGreaterThan(-1);
    expect(bundledConfigIndex).toBeGreaterThan(-1);
    expect(persistedLookupIndex).toBeLessThan(bundledConfigIndex);
  });

  it("gates dev URL resolution behind DEBUG builds", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("#if DEBUG");
    expect(output).toContain("if let devURL = resolveDevURL()");
    expect(output).toContain("private func resolveDevURL() -> URL?");
  });

  it("enables WKWebView inspection in DEBUG builds for Safari Develop tools", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("if #available(iOS 16.4, *)");
    expect(output).toContain("webView.isInspectable = true");
    expect(output).toContain("if #available(macOS 13.3, *)");
  });

  it("uses a dark-mode-aware blank state for the primary iOS webview", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("view.backgroundColor = .systemBackground");
    expect(output).toContain("webView.isOpaque = false");
    expect(output).toContain("webView.backgroundColor = .clear");
    expect(output).toContain("webView.scrollView.backgroundColor = .clear");
  });

  it("opens external links in the system browser instead of silently no-oping", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("webView.uiDelegate = self");
    expect(output).toContain("navigationType == .linkActivated");
    expect(output).toContain(
      "UIApplication.shared.open(url, options: [:], completionHandler: nil)",
    );
    expect(output).toContain("NSWorkspace.shared.open(url)");
    expect(output).toContain("createWebViewWith configuration: WKWebViewConfiguration");
  });

  it("implements WKUIDelegate JavaScript dialogs for alert/confirm/prompt", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("runJavaScriptAlertPanelWithMessage");
    expect(output).toContain("runJavaScriptConfirmPanelWithMessage");
    expect(output).toContain("runJavaScriptTextInputPanelWithPrompt");
  });

  it("delegates alert/confirm/prompt to chromeState.enqueueAlert with guard fallback", () => {
    const output = viewControllerTemplate(baseConfig);
    // All three dialog methods should use the guard pattern
    expect(output).toContain("guard let chromeState else { completionHandler(); return }");
    expect(output).toContain("guard let chromeState else { completionHandler(false); return }");
    expect(output).toContain("guard let chromeState else { completionHandler(nil); return }");
    // Should delegate to chromeState.enqueueAlert
    expect(output).toContain("chromeState.enqueueAlert(");
    // Should NOT contain UIAlertController or NSAlert fallback code
    expect(output).not.toContain("UIAlertController(");
    expect(output).not.toContain("NSAlert()");
  });

  it("marks the main webview as the primary bridge source", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("bridge.primaryWebView = webView");
  });

  it("exposes the iOS bridge handler for sibling native webview hosts", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("func nativiteBridgeHandler() -> NativiteBridge");
    expect(output).toContain("bridge");
  });

  it("uses WKWebsiteDataStore.default() so the primary webview shares a process with child webviews (iOS 15+)", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("config.websiteDataStore = WKWebsiteDataStore.default()");
    // WKProcessPool is deprecated in iOS 15 and no longer needed — process
    // sharing is automatic when webviews share the same WKWebsiteDataStore.
    expect(output).not.toContain("WKProcessPool");
  });

  it("injects instance name 'main' so the native message broker can identify this webview", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain('window.__nativekit_instance_name__ = \\"main\\"');
    expect(output).toContain("injectionTime: .atDocumentStart");
  });

  it("signals first load complete to SwiftUI by clearing splash state in didFinish", () => {
    const output = viewControllerTemplate(baseConfig);
    const didFinishIndex = output.indexOf(
      "func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!)",
    );
    const setSplashIndex = output.indexOf("chromeState?.splashVisible = false", didFinishIndex);

    expect(didFinishIndex).toBeGreaterThan(-1);
    expect(setSplashIndex).toBeGreaterThan(didFinishIndex);

    // UIKit splash code should be fully removed
    expect(output).not.toContain("showSplashOverlay()");
    expect(output).not.toContain("hideSplashOverlay()");
    expect(output).not.toContain("splashOverlayView");
  });

  // ── macOS-specific tests ──────────────────────────────────────────────────

  describe("macOS", () => {
    function macosSection(output: string): string {
      // Find the macOS ViewController class, not the #elseif inside shared helpers.
      const marker = "class ViewController: NSViewController";
      const classStart = output.indexOf(marker);
      // Walk back to the preceding #elseif os(macOS)
      const start = output.lastIndexOf("#elseif os(macOS)", classStart);
      // The final #endif closes the top-level #if os(iOS)/#elseif os(macOS) block.
      const end = output.lastIndexOf("#endif");
      return output.slice(start, end);
    }

    it("loads content in viewDidLoad rather than deferring to viewDidAppear", () => {
      const macos = macosSection(viewControllerTemplate(baseConfig));
      const viewDidLoadIndex = macos.indexOf("override func viewDidLoad()");
      const loadContentIndex = macos.indexOf("loadContent()", viewDidLoadIndex);

      expect(viewDidLoadIndex).toBeGreaterThan(-1);
      expect(loadContentIndex).toBeGreaterThan(viewDidLoadIndex);

      // Should not defer to viewDidAppear — SwiftUI's NSViewControllerRepresentable
      // does not reliably call viewDidAppear, causing a blank screen on launch.
      expect(macos).not.toContain("viewDidAppear");
      expect(macos).not.toContain("hasLoadedContent");
    });

    it("injects instance name 'main' so the native message broker can identify this webview", () => {
      const macos = macosSection(viewControllerTemplate(baseConfig));
      expect(macos).toContain('window.__nativekit_instance_name__ = \\"main\\"');
      expect(macos).toContain("injectionTime: .atDocumentStart");
    });

    it("re-pushes CSS variables after navigation in didFinish", () => {
      const macos = macosSection(viewControllerTemplate(baseConfig));
      const didFinishIndex = macos.indexOf(
        "func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!)",
      );
      expect(didFinishIndex).toBeGreaterThan(-1);

      const updateSafeAreaIndex = macos.indexOf("vars.updateSafeArea(", didFinishIndex);
      expect(updateSafeAreaIndex).toBeGreaterThan(didFinishIndex);
    });

    it("replays deferred chrome state from viewDidLayout once the window is available", () => {
      const macos = macosSection(viewControllerTemplate(baseConfig));
      const viewDidLayoutIndex = macos.indexOf("override func viewDidLayout()");
      expect(viewDidLayoutIndex).toBeGreaterThan(-1);

      const replayIndex = macos.indexOf("bridge.chrome.replayPendingState()", viewDidLayoutIndex);
      expect(replayIndex).toBeGreaterThan(viewDidLayoutIndex);
      // Guard ensures replay only fires when the window is attached
      expect(macos).toContain("if view.window != nil");
    });

    it("uses WKWebsiteDataStore.default() for child webview process sharing", () => {
      const macos = macosSection(viewControllerTemplate(baseConfig));
      expect(macos).toContain("config.websiteDataStore = WKWebsiteDataStore.default()");
    });
  });
});
