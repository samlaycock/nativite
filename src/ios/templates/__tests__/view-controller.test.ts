import { describe, expect, it } from "bun:test";

import { baseConfig, splashImageConfig } from "../../../__tests__/fixtures.ts";
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

  it("enables WKWebView inspection in DEBUG builds for Safari Develop tools", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("if #available(iOS 16.4, *)");
    expect(output).toContain("webView.isInspectable = true");
    expect(output).toContain("if #available(macOS 13.3, *)");
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

  it("shows a dark-mode-aware default iOS splash overlay with a centered spinner", () => {
    const output = viewControllerTemplate(baseConfig);
    expect(output).toContain("private var splashOverlayView: UIView?");
    expect(output).toContain("splashView.backgroundColor = UIColor.systemBackground");
    expect(output).toContain("let activityIndicator = UIActivityIndicatorView(style: .large)");
    expect(output).toContain("activityIndicator.startAnimating()");
    expect(output).toContain(
      "activityIndicator.centerXAnchor.constraint(equalTo: splashView.centerXAnchor)",
    );
    expect(output).toContain(
      "activityIndicator.centerYAnchor.constraint(equalTo: splashView.centerYAnchor)",
    );
    expect(output).toContain("showSplashOverlay()");
  });

  it("keeps the iOS splash overlay visible until the first page load completes", () => {
    const output = viewControllerTemplate(baseConfig);
    const showSplashIndex = output.indexOf("showSplashOverlay()");
    const loadContentIndex = output.indexOf("loadContent()");
    const didFinishIndex = output.indexOf(
      "func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!)",
    );
    const hideSplashIndex = output.indexOf("hideSplashOverlay()", didFinishIndex);

    expect(showSplashIndex).toBeGreaterThan(-1);
    expect(loadContentIndex).toBeGreaterThan(-1);
    expect(didFinishIndex).toBeGreaterThan(-1);
    expect(hideSplashIndex).toBeGreaterThan(didFinishIndex);
    expect(showSplashIndex).toBeLessThan(loadContentIndex);
  });

  it("renders splash image on iOS overlay when splash image is configured", () => {
    const output = viewControllerTemplate(splashImageConfig);
    expect(output).toContain('if let splashImage = UIImage(named: "Splash")');
    expect(output).toContain("splashImageView.contentMode = .center");
    expect(output).not.toContain("UIActivityIndicatorView(style: .large)");
  });
});
