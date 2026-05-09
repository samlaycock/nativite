import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "ViewController.swift")).text();

function macosSection(output: string): string {
  const marker = "class ViewController: NSViewController";
  const classStart = output.indexOf(marker);
  const start = output.lastIndexOf("#elseif os(macOS)", classStart);
  const end = output.lastIndexOf("#endif");
  return output.slice(start, end);
}

describe("ViewController.swift", () => {
  it("does not crash when embedded manifest metadata is missing or invalid", () => {
    expect(swift).toContain(
      'print("[Nativite] Warning: Missing embedded dist/manifest.json. Build the web bundle first.")',
    );
    expect(swift).toContain(
      'print("[Nativite] Warning: Invalid embedded dist/manifest.json. Rebuild the web bundle.")',
    );
    expect(swift).not.toContain("fatalError(");
  });

  it("treats ipad and ios bundle metadata as compatible on iOS", () => {
    expect(swift).toContain('let compatiblePlatforms: Set<String> = ["ios", "ipad"]');
    expect(swift).toContain('let expectedPlatformDescription = "ios or ipad"');
  });

  it("falls back to bundled dev.json when launch env vars are unavailable", () => {
    expect(swift).toContain('Bundle.main.url(forResource: "dev", withExtension: "json")');
    expect(swift).toContain('json["devURL"] as? String');
  });

  it("persists env-provided dev URL so relaunches keep using the same server", () => {
    expect(swift).toContain('let devURLDefaultsKey = "nativite.dev.url"');
    expect(swift).toContain("UserDefaults.standard.set(envValue, forKey: devURLDefaultsKey)");
  });

  it("checks persisted dev URL before falling back to bundled dev.json", () => {
    const persistedLookupIndex = swift.indexOf(
      "UserDefaults.standard.string(forKey: devURLDefaultsKey)",
    );
    const bundledConfigIndex = swift.indexOf(
      'Bundle.main.url(forResource: "dev", withExtension: "json")',
    );
    expect(persistedLookupIndex).toBeGreaterThan(-1);
    expect(bundledConfigIndex).toBeGreaterThan(-1);
    expect(persistedLookupIndex).toBeLessThan(bundledConfigIndex);
  });

  it("gates dev URL resolution behind DEBUG builds", () => {
    expect(swift).toContain("#if DEBUG");
    expect(swift).toContain("if let devURL = resolveDevURL()");
    expect(swift).toContain("private func resolveDevURL() -> URL?");
  });

  it("enables WKWebView inspection in DEBUG builds for Safari Develop tools", () => {
    expect(swift).toContain("if #available(iOS 16.4, *)");
    expect(swift).toContain("webView.isInspectable = true");
    expect(swift).toContain("if #available(macOS 13.3, *)");
  });

  it("uses a dark-mode-aware blank state for the primary iOS webview", () => {
    expect(swift).toContain("view.backgroundColor = .systemBackground");
    expect(swift).toContain("webView.isOpaque = false");
    expect(swift).toContain("webView.backgroundColor = .clear");
    expect(swift).toContain("webView.scrollView.backgroundColor = .clear");
  });

  it("sets underPageBackgroundColor on the iOS webview for dark-mode-aware overscroll", () => {
    expect(swift).toContain("webView.underPageBackgroundColor = .systemBackground");
  });

  it("opens external links in the system browser instead of silently no-oping", () => {
    expect(swift).toContain("webView.uiDelegate = self");
    expect(swift).toContain("navigationType == .linkActivated");
    expect(swift).toContain("UIApplication.shared.open(url, options: [:], completionHandler: nil)");
    expect(swift).toContain("NSWorkspace.shared.open(url)");
    expect(swift).toContain("createWebViewWith configuration: WKWebViewConfiguration");
  });

  it("implements WKUIDelegate JavaScript dialogs for alert/confirm/prompt", () => {
    expect(swift).toContain("runJavaScriptAlertPanelWithMessage");
    expect(swift).toContain("runJavaScriptConfirmPanelWithMessage");
    expect(swift).toContain("runJavaScriptTextInputPanelWithPrompt");
  });

  it("delegates alert/confirm/prompt to chromeState.enqueueAlert with guard fallback", () => {
    expect(swift).toContain("guard let chromeState else { completionHandler(); return }");
    expect(swift).toContain("guard let chromeState else { completionHandler(false); return }");
    expect(swift).toContain("guard let chromeState else { completionHandler(nil); return }");
    expect(swift).toContain("chromeState.enqueueAlert(");
    expect(swift).not.toContain("UIAlertController(");
    expect(swift).not.toContain("NSAlert()");
  });

  it("marks the main webview as the primary bridge source", () => {
    expect(swift).toContain("bridge.primaryWebView = webView");
  });

  it("exposes the iOS bridge handler for sibling native webview hosts", () => {
    expect(swift).toContain("func nativiteBridgeHandler() -> NativiteBridge");
    expect(swift).toContain("bridge");
  });

  it("uses WKWebsiteDataStore.default() so the primary webview shares a process with child webviews", () => {
    expect(swift).toContain("config.websiteDataStore = WKWebsiteDataStore.default()");
    expect(swift).not.toContain("WKProcessPool");
  });

  it("injects instance name 'main' so the native message broker can identify this webview", () => {
    expect(swift).toContain('window.__nativite_instance_name__ = \\"main\\"');
    expect(swift).toContain("injectionTime: .atDocumentStart");
  });

  it("guards OTA calls behind NativiteConfig.otaEnabled", () => {
    expect(swift).toContain("if NativiteConfig.otaEnabled {");
    expect(swift).toContain("otaUpdater.rollbackPendingLaunchIfNeeded()");
    expect(swift).toContain("otaUpdater.applyPendingUpdateIfAvailable()");
    expect(swift).toContain("Task { await otaUpdater.checkForUpdate() }");
    expect(swift).toContain("otaUpdater.markLaunchSucceeded()");
  });

  it("guards OTA bundle check in loadContent with NativiteConfig.otaEnabled", () => {
    expect(swift).toContain(
      "if NativiteConfig.otaEnabled, let otaIndex = otaUpdater.activeBundleIndexURL()",
    );
  });

  it("always calls applyInitialState (method is a no-op when no defaultChrome configured)", () => {
    expect(swift).toContain("bridge.chrome.applyInitialState()");
  });

  it("signals first load complete to SwiftUI by clearing splash state in didFinish", () => {
    const didFinishIndex = swift.indexOf(
      "func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!)",
    );
    const setSplashIndex = swift.indexOf("chromeState?.splashVisible = false", didFinishIndex);
    expect(didFinishIndex).toBeGreaterThan(-1);
    expect(setSplashIndex).toBeGreaterThan(didFinishIndex);
    expect(swift).not.toContain("showSplashOverlay()");
    expect(swift).not.toContain("hideSplashOverlay()");
    expect(swift).not.toContain("splashOverlayView");
  });

  describe("macOS", () => {
    it("loads content in viewDidLoad rather than deferring to viewDidAppear", () => {
      const macos = macosSection(swift);
      const viewDidLoadIndex = macos.indexOf("override func viewDidLoad()");
      const loadContentIndex = macos.indexOf("loadContent()", viewDidLoadIndex);
      expect(viewDidLoadIndex).toBeGreaterThan(-1);
      expect(loadContentIndex).toBeGreaterThan(viewDidLoadIndex);
      expect(macos).not.toContain("viewDidAppear");
      expect(macos).not.toContain("hasLoadedContent");
    });

    it("replays deferred chrome state from viewDidLayout once the window is available", () => {
      const macos = macosSection(swift);
      const viewDidLayoutIndex = macos.indexOf("override func viewDidLayout()");
      expect(viewDidLayoutIndex).toBeGreaterThan(-1);
      const replayIndex = macos.indexOf("bridge.chrome.replayPendingState()", viewDidLayoutIndex);
      expect(replayIndex).toBeGreaterThan(viewDidLayoutIndex);
      expect(macos).toContain("if view.window != nil");
    });

    it("sets underPageBackgroundColor on the macOS webview for dark-mode-aware overscroll", () => {
      const macos = macosSection(swift);
      expect(macos).toContain("webView.underPageBackgroundColor = .windowBackgroundColor");
    });
  });
});
