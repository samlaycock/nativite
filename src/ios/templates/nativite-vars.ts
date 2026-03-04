export function nativiteVarsTemplate(): string {
  // ── Shared code (Foundation + WebKit only — compiles on both platforms) ────

  const sharedInstallation = `
  // Back-reference to the WKWebView for evaluateJavaScript calls.
  weak var webView: WKWebView?

  // ── Mutable state (updated on each relevant event) ──────────────────────────

  private var safeTop:    CGFloat = 0
  private var safeBottom: CGFloat = 0
  private var safeLeft:   CGFloat = 0
  private var safeRight:  CGFloat = 0

  private var navHeight:     CGFloat = 0
  private var navVisible:    Bool    = false
  private var tabHeight:     CGFloat = 0
  private var tabVisible:    Bool    = false
  private var toolbarHeight: CGFloat = 0
  private var toolbarVisible:Bool    = false

  // ── Installation ─────────────────────────────────────────────────────────────

  // Call before the WKWebView is created. Adds the user script that seeds
  // :root with default values before any other script runs.
  func installUserScript(into configuration: WKWebViewConfiguration) {
    let script = WKUserScript(
      source: buildInitScript(),
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
    )
    configuration.userContentController.addUserScript(script)
  }`;

  const sharedChrome = `
  // Called by NativiteChrome after applying state changes.
  func updateChrome(
    navHeight h: CGFloat?, navVisible v: Bool?,
    tabHeight th: CGFloat?, tabVisible tv: Bool?,
    toolbarHeight trh: CGFloat?, toolbarVisible trv: Bool?
  ) {
    if let h  = h  { navHeight     = h }
    if let v  = v  { navVisible    = v }
    if let th = th { tabHeight     = th }
    if let tv = tv { tabVisible    = tv }
    if let trh = trh { toolbarHeight  = trh }
    if let trv = trv { toolbarVisible = trv }

    let insetTop    = safeTop + (navVisible ? navHeight : 0)
    let insetBottom = safeBottom + (tabVisible ? tabHeight : 0) + (toolbarVisible ? toolbarHeight : 0)

    patch([
      "--nv-nav-height":      px(navHeight),
      "--nv-nav-visible":     navVisible    ? "1" : "0",
      "--nv-tab-height":      px(tabHeight),
      "--nv-tab-visible":     tabVisible    ? "1" : "0",
      "--nv-toolbar-height":  px(toolbarHeight),
      "--nv-toolbar-visible": toolbarVisible ? "1" : "0",
      "--nv-inset-top":       px(insetTop),
      "--nv-inset-bottom":    px(insetBottom),
    ])
  }`;

  const sharedHelpers = `
  // ── Private helpers ──────────────────────────────────────────────────────────

  // Build the full initial CSS variable block as a JS string.
  private func buildInitScript() -> String {
    // These are static defaults; dynamic values are patched after load.
    let defaults = """
      --nv-safe-top:0px;--nv-safe-bottom:0px;--nv-safe-left:0px;--nv-safe-right:0px;
      --nv-nav-height:0px;--nv-nav-visible:0;
      --nv-tab-height:0px;--nv-tab-visible:0;
      --nv-toolbar-height:0px;--nv-toolbar-visible:0;
      --nv-status-height:0px;
      --nv-inset-top:0px;--nv-inset-bottom:0px;--nv-inset-left:0px;--nv-inset-right:0px;
      --nv-keyboard-height:0px;--nv-keyboard-visible:0;
      --nv-keyboard-floating:0;--nv-keyboard-inset:0px;
      --nv-keyboard-duration:250ms;--nv-keyboard-curve:ease-in-out;
      --nv-accessory-height:0px;
      --nv-nav-depth:0;--nv-title-collapse:0;--nv-pop-gesture:0;
      --nv-sidebar-width:0px;--nv-sidebar-visible:0;
      --nv-sheet-visible:0;--nv-sheet-detent:0;
      --nv-display-scale:2;--nv-display-corner:0px;
      --nv-is-phone:0;--nv-is-tablet:0;--nv-is-desktop:0;
      --nv-is-portrait:1;--nv-is-landscape:0;
      --nv-is-compact-width:0;--nv-split-fraction:1;
      --nv-is-dark:0;--nv-is-light:1;
      --nv-contrast:0;--nv-reduced-motion:0;--nv-reduced-transparency:0;
      --nv-accent-r:0;--nv-accent-g:122;--nv-accent-b:255;
      --nv-accent:rgb(var(--nv-accent-r),var(--nv-accent-g),var(--nv-accent-b));
      --nv-font-scale:1;
      --nv-font-body:17px;--nv-font-callout:16px;--nv-font-caption1:12px;
      --nv-font-caption2:11px;--nv-font-footnote:13px;--nv-font-headline:17px;
      --nv-font-subheadline:15px;--nv-font-title1:28px;--nv-font-title2:22px;
      --nv-font-title3:20px;--nv-font-largeTitle:34px;
    """
    // Keep Vite's error overlay host inside native insets so its controls
    // remain reachable when debugging in WKWebView. Do not emit this CSS in
    // release builds where the Vite overlay does not exist.
    #if DEBUG
    let devOverlayInsets = """
      vite-error-overlay{
        position:fixed !important;
        inset:var(--nv-inset-top,0px) 0 var(--nv-inset-bottom,0px) 0 !important;
        height:auto !important;
        max-height:calc(100vh - var(--nv-inset-top,0px) - var(--nv-inset-bottom,0px)) !important;
        box-sizing:border-box !important;
      }
    """
    #else
    let devOverlayInsets = ""
    #endif
    // Resolve the platform string at runtime so iPad is distinguished from iPhone.
    #if os(iOS)
    let nvPlatform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
    #elseif os(macOS)
    let nvPlatform = "macos"
    #endif

    // Collapse multi-line strings to single lines before embedding in JS.
    // Swift multi-line string literals contain literal newlines; embedding them
    // directly inside a JS single-quoted string causes a syntax error and
    // silently prevents all CSS variables from being set in WKWebView.
    let css = defaults.components(separatedBy: .newlines)
                      .map { $0.trimmingCharacters(in: .whitespaces) }
                      .joined()
    let devCSS = devOverlayInsets.components(separatedBy: .newlines)
                                 .map { $0.trimmingCharacters(in: .whitespaces) }
                                 .joined()

    // Inject as a <style> block so it is in the cascade (not inline style).
    // Also attach a tiny patcher function used by subsequent updates.
    // Data attributes are set here so CSS attribute selectors and Tailwind
    // variant modifiers (e.g. [data-nv-platform="ios"]:) work from first paint.
    return """
    (function(){
      var s=document.createElement('style');
      s.id='__nv_vars__';
      s.textContent=':root{\\(css)}\\(devCSS)';
      document.documentElement.appendChild(s);
      window.__nv_patch=function(vars){
        var r=document.documentElement;
        for(var k in vars){r.style.setProperty(k,vars[k]);}
      };
      document.documentElement.setAttribute('data-nv-platform','\\(nvPlatform)');
    })();
    """
  }

  // Serialise a dictionary of var→value and call __nv_patch on the live page.
  private func patch(_ vars: [String: String]) {
    guard let wv = webView else { return }
    guard !vars.isEmpty else { return }

    var entries: [String] = []
    for (key, value) in vars {
      // Escape for JS string: backslash, then double-quote
      let escapedKey   = key.replacingOccurrences(of: "\\\\", with: "\\\\\\\\")
                            .replacingOccurrences(of: "\\"",  with: "\\\\\\"")
      let escapedValue = value.replacingOccurrences(of: "\\\\", with: "\\\\\\\\")
                              .replacingOccurrences(of: "\\"",  with: "\\\\\\"")
      entries.append("\\"\\(escapedKey)\\":\\"\\(escapedValue)\\"")
    }

    let js = "if(window.__nv_patch){window.__nv_patch({\\(entries.joined(separator: ","))});}"

    DispatchQueue.main.async {
      wv.evaluateJavaScript(js, completionHandler: nil)
    }
  }

  // ── Formatting helpers ───────────────────────────────────────────────────────

  private func px(_ value: CGFloat) -> String {
    String(format: "%.1fpx", value)
  }`;

  // ── iOS implementation ──────────────────────────────────────────────────────

  const iosVars = `#if os(iOS)
import UIKit
import WebKit

// NativiteVars manages the --nv-* CSS custom property layer.
//
// Variables are injected as a WKUserScript at documentStart so they exist
// before any content renders. Updates are pushed via evaluateJavaScript
// using a tiny inline helper that patches individual properties on :root.
//
// Sources of truth:
//   safe area    → viewDidLayoutSubviews (forwarded by ViewController)
//   dark mode    → registerForTraitChanges (UITraitUserInterfaceStyle)
//   dynamic type → registerForTraitChanges (UITraitPreferredContentSizeCategory)
//   keyboard     → UIKeyboard* notifications
//   orientation  → viewDidLayoutSubviews (bounds + userInterfaceIdiom)
//   chrome geom  → NativiteChrome calls updateChrome(_:) after each setState

class NativiteVars: NSObject {
${sharedInstallation}

  private var statusHeight:  CGFloat = 0

  private var keyboardHeight:   CGFloat = 0
  private var keyboardVisible:  Bool    = false
  private var keyboardFloating: Bool    = false
  private var keyboardDuration: Double  = 0.25
  private var keyboardCurve:    String  = "ease-in-out"

  // Cached screen width — updated from updateSafeArea() whenever the window
  // is available, used by keyboardWillChange to detect a floating keyboard
  // without going through the deprecated UIScreen.main.
  private var lastKnownScreenWidth: CGFloat = 390

  private var isDark:             Bool  = false
  private var isHighContrast:     Bool  = false
  private var reducedMotion:      Bool  = false
  private var reducedTransparency:Bool  = false
  private var fontScale:          CGFloat = 1.0

  // Subscribe to keyboard and other system notifications. Call after
  // the ViewController's view is loaded.
  func observeSystemEvents() {
    let nc = NotificationCenter.default
    nc.addObserver(self, selector: #selector(keyboardWillChange(_:)),
                   name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    nc.addObserver(self, selector: #selector(keyboardWillHide(_:)),
                   name: UIResponder.keyboardWillHideNotification, object: nil)
    nc.addObserver(self, selector: #selector(accessibilityChanged),
                   name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
    nc.addObserver(self, selector: #selector(accessibilityChanged),
                   name: UIAccessibility.reduceTransparencyStatusDidChangeNotification, object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // ── Updates from ViewController ──────────────────────────────────────────────

  func updateSafeArea(_ insets: UIEdgeInsets, in viewController: UIViewController) {
    safeTop    = insets.top
    safeBottom = insets.bottom
    safeLeft   = insets.left
    safeRight  = insets.right

    // Status bar height = top safe area when not in compact
    statusHeight = viewController.view.window?.windowScene?.statusBarManager?.statusBarFrame.height ?? 0

    // Grab the screen via the window to avoid UIScreen.main (deprecated iOS 16+).
    let screen = viewController.view.window?.screen
    if let w = screen?.bounds.width { lastKnownScreenWidth = w }

    // Device / orientation
    let bounds   = viewController.view.bounds
    let idiom    = UIDevice.current.userInterfaceIdiom
    let isPhone  = idiom == .phone
    let isTablet = idiom == .pad

    // Derive combined insets
    let insetTop    = safeTop + (navVisible ? navHeight : 0)
    let insetBottom = safeBottom + (tabVisible ? tabHeight : 0) + (toolbarVisible ? toolbarHeight : 0)

    var vars: [String: String] = [
      "--nv-safe-top":    px(safeTop),
      "--nv-safe-bottom": px(safeBottom),
      "--nv-safe-left":   px(safeLeft),
      "--nv-safe-right":  px(safeRight),
      "--nv-status-height": px(statusHeight),
      "--nv-inset-top":    px(insetTop),
      "--nv-inset-bottom": px(insetBottom),
      "--nv-inset-left":   px(safeLeft),
      "--nv-inset-right":  px(safeRight),
      "--nv-is-phone":     isPhone  ? "1" : "0",
      "--nv-is-tablet":    isTablet ? "1" : "0",
      "--nv-is-desktop":   "0",
      "--nv-is-portrait":  bounds.height >= bounds.width ? "1" : "0",
      "--nv-is-landscape": bounds.width  >  bounds.height ? "1" : "0",
      "--nv-display-scale": String(format: "%.0f", screen?.scale ?? 2.0),
      "--nv-display-corner": px(screen?.displayCornerRadius ?? 0),
    ]

    // Keyboard inset = keyboard above safe area bottom (only when docked)
    let keyboardInset = keyboardVisible && !keyboardFloating
      ? max(0, keyboardHeight - safeBottom) : 0
    vars["--nv-keyboard-inset"] = px(keyboardInset)

    patch(vars)
  }

  func updateTraits(_ traitCollection: UITraitCollection) {
    isDark              = traitCollection.userInterfaceStyle == .dark
    isHighContrast      = traitCollection.accessibilityContrast == .high
    reducedMotion       = UIAccessibility.isReduceMotionEnabled
    reducedTransparency = UIAccessibility.isReduceTransparencyEnabled

    // Font scale from UIContentSizeCategory
    let category = traitCollection.preferredContentSizeCategory
    fontScale = fontScaleFor(category)

    // Accent color (system blue default; can be overridden in asset catalog)
    let accent = UIColor.tintColor.resolvedColor(with: traitCollection)
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
    accent.getRed(&r, green: &g, blue: &b, alpha: nil)

    // Dynamic type sizes (points → px is 1:1 on screen in WKWebView)
    let fontSizes = dynamicTypeSizes(for: traitCollection)

    let vars: [String: String] = [
      "--nv-is-dark":              isDark ? "1" : "0",
      "--nv-is-light":             isDark ? "0" : "1",
      "--nv-contrast":             isHighContrast ? "1" : "0",
      "--nv-reduced-motion":       reducedMotion ? "1" : "0",
      "--nv-reduced-transparency": reducedTransparency ? "1" : "0",
      "--nv-font-scale":           String(format: "%.2f", fontScale),
      "--nv-accent-r":             String(Int(r * 255)),
      "--nv-accent-g":             String(Int(g * 255)),
      "--nv-accent-b":             String(Int(b * 255)),
      "--nv-font-body":       fontSizes.body,
      "--nv-font-callout":    fontSizes.callout,
      "--nv-font-caption1":   fontSizes.caption1,
      "--nv-font-caption2":   fontSizes.caption2,
      "--nv-font-footnote":   fontSizes.footnote,
      "--nv-font-headline":   fontSizes.headline,
      "--nv-font-subheadline":fontSizes.subheadline,
      "--nv-font-title1":     fontSizes.title1,
      "--nv-font-title2":     fontSizes.title2,
      "--nv-font-title3":     fontSizes.title3,
      "--nv-font-largeTitle": fontSizes.largeTitle,
    ]

    patch(vars)
  }
${sharedChrome}

  // Called by NativiteKeyboard after its accessory view is laid out.
  // Keeps --nv-accessory-height in sync with the native bar height.
  func updateAccessoryHeight(_ height: CGFloat) {
    patch(["--nv-accessory-height": px(height)])
  }

  // ── Keyboard notifications ───────────────────────────────────────────────────

  @objc private func accessibilityChanged() {
    reducedMotion       = UIAccessibility.isReduceMotionEnabled
    reducedTransparency = UIAccessibility.isReduceTransparencyEnabled
    patch([
      "--nv-reduced-motion":       reducedMotion       ? "1" : "0",
      "--nv-reduced-transparency": reducedTransparency ? "1" : "0",
    ])
  }

  @objc private func keyboardWillChange(_ notification: Notification) {
    guard let info = notification.userInfo,
          let endFrame = info[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
    else { return }

    keyboardHeight  = endFrame.height
    keyboardVisible = true

    // Detect floating keyboard on iPad: width < full screen width
    keyboardFloating = endFrame.width < lastKnownScreenWidth - 50

    keyboardDuration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25

    let curveRaw = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? Int) ?? 0
    keyboardCurve = cssTimingFunction(from: UIView.AnimationCurve(rawValue: curveRaw) ?? .easeInOut)

    let keyboardInset = keyboardFloating ? 0 : max(0, keyboardHeight - safeBottom)

    patch([
      "--nv-keyboard-height":   px(keyboardHeight),
      "--nv-keyboard-visible":  "1",
      "--nv-keyboard-floating": keyboardFloating ? "1" : "0",
      "--nv-keyboard-inset":    px(keyboardInset),
      "--nv-keyboard-duration": String(format: "%.0fms", keyboardDuration * 1000),
      "--nv-keyboard-curve":    keyboardCurve,
    ])
  }

  @objc private func keyboardWillHide(_ notification: Notification) {
    let info = notification.userInfo
    keyboardHeight  = 0
    keyboardVisible = false
    keyboardFloating = false

    let duration = (info?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
    let curveRaw = (info?[UIResponder.keyboardAnimationCurveUserInfoKey] as? Int) ?? 0
    let curve    = cssTimingFunction(from: UIView.AnimationCurve(rawValue: curveRaw) ?? .easeInOut)

    patch([
      "--nv-keyboard-height":   "0px",
      "--nv-keyboard-visible":  "0",
      "--nv-keyboard-floating": "0",
      "--nv-keyboard-inset":    "0px",
      "--nv-keyboard-duration": String(format: "%.0fms", duration * 1000),
      "--nv-keyboard-curve":    curve,
    ])
  }
${sharedHelpers}

  private func cssTimingFunction(from curve: UIView.AnimationCurve) -> String {
    switch curve {
    case .easeIn:    return "ease-in"
    case .easeOut:   return "ease-out"
    case .easeInOut: return "ease-in-out"
    case .linear:    return "linear"
    @unknown default: return "ease-in-out"
    }
  }

  private func fontScaleFor(_ category: UIContentSizeCategory) -> CGFloat {
    switch category {
    case .extraSmall:                  return 0.82
    case .small:                       return 0.88
    case .medium:                      return 0.94
    case .large:                       return 1.00   // default
    case .extraLarge:                  return 1.12
    case .extraExtraLarge:             return 1.24
    case .extraExtraExtraLarge:        return 1.36
    case .accessibilityMedium:         return 1.59
    case .accessibilityLarge:          return 1.88
    case .accessibilityExtraLarge:     return 2.06
    case .accessibilityExtraExtraLarge:return 2.35
    case .accessibilityExtraExtraExtraLarge: return 2.76
    default:                           return 1.00
    }
  }

  private struct FontSizes {
    var body, callout, caption1, caption2, footnote,
        headline, subheadline, title1, title2, title3, largeTitle: String
  }

  private func dynamicTypeSizes(for traits: UITraitCollection) -> FontSizes {
    func pt(_ style: UIFont.TextStyle) -> String {
      let f = UIFont.preferredFont(forTextStyle: style, compatibleWith: traits)
      return String(format: "%.1fpx", f.pointSize)
    }
    return FontSizes(
      body:         pt(.body),
      callout:      pt(.callout),
      caption1:     pt(.caption1),
      caption2:     pt(.caption2),
      footnote:     pt(.footnote),
      headline:     pt(.headline),
      subheadline:  pt(.subheadline),
      title1:       pt(.title1),
      title2:       pt(.title2),
      title3:       pt(.title3),
      largeTitle:   pt(.largeTitle)
    )
  }
}

// ─── UIScreen corner radius ───────────────────────────────────────────────────

private extension UIScreen {
  // The corner radius of the display. Returns 0 on devices without rounded corners.
  var displayCornerRadius: CGFloat {
    guard let value = value(forKey: "_displayCornerRadius") as? CGFloat else { return 0 }
    return value
  }
}`;

  // ── macOS implementation ──────────────────────────────────────────────────

  const macosVars = `#elseif os(macOS)
import Cocoa
import WebKit

// NativiteVars manages the --nv-* CSS custom property layer on macOS.
// Same approach as iOS: inject a WKUserScript at documentStart, then patch
// individual properties via evaluateJavaScript.

class NativiteVars: NSObject {
${sharedInstallation}

  private var isDark: Bool = false

  // Subscribe to appearance change notifications.
  func observeSystemEvents() {
    DistributedNotificationCenter.default().addObserver(
      self,
      selector: #selector(appearanceChanged),
      name: NSNotification.Name("AppleInterfaceThemeChangedNotification"),
      object: nil
    )
    updateAppearance()
  }

  deinit {
    DistributedNotificationCenter.default().removeObserver(self)
  }

  // ── Updates from ViewController ──────────────────────────────────────────────

  func updateSafeArea(_ insets: NSEdgeInsets) {
    safeTop    = insets.top
    safeBottom = insets.bottom
    safeLeft   = insets.left
    safeRight  = insets.right

    let insetTop    = safeTop + (navVisible ? navHeight : 0)
    let insetBottom = safeBottom + (tabVisible ? tabHeight : 0) + (toolbarVisible ? toolbarHeight : 0)

    let screen = NSScreen.main
    let scale = screen?.backingScaleFactor ?? 2.0

    let vars: [String: String] = [
      "--nv-safe-top":    px(safeTop),
      "--nv-safe-bottom": px(safeBottom),
      "--nv-safe-left":   px(safeLeft),
      "--nv-safe-right":  px(safeRight),
      "--nv-status-height": "0px",
      "--nv-inset-top":    px(insetTop),
      "--nv-inset-bottom": px(insetBottom),
      "--nv-inset-left":   px(safeLeft),
      "--nv-inset-right":  px(safeRight),
      "--nv-is-phone":     "0",
      "--nv-is-tablet":    "0",
      "--nv-is-desktop":   "1",
      "--nv-is-portrait":  "0",
      "--nv-is-landscape": "1",
      "--nv-display-scale": String(format: "%.0f", scale),
      "--nv-display-corner": "0px",
      // No software keyboard on macOS
      "--nv-keyboard-height":   "0px",
      "--nv-keyboard-visible":  "0",
      "--nv-keyboard-floating": "0",
      "--nv-keyboard-inset":    "0px",
    ]

    patch(vars)
  }

  @objc private func appearanceChanged() {
    updateAppearance()
  }

  private func updateAppearance() {
    let appearance = NSApp.effectiveAppearance
    isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua

    // Accent color
    let accent = NSColor.controlAccentColor
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
    if let rgb = accent.usingColorSpace(.sRGB) {
      r = rgb.redComponent
      g = rgb.greenComponent
      b = rgb.blueComponent
    }

    // Dynamic type — use NSFont.preferredFont where available
    let fontSizes = macOSFontSizes()

    let vars: [String: String] = [
      "--nv-is-dark":              isDark ? "1" : "0",
      "--nv-is-light":             isDark ? "0" : "1",
      "--nv-contrast":             "0",
      "--nv-reduced-motion":       NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? "1" : "0",
      "--nv-reduced-transparency": NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency ? "1" : "0",
      "--nv-font-scale":           "1.00",
      "--nv-accent-r":             String(Int(r * 255)),
      "--nv-accent-g":             String(Int(g * 255)),
      "--nv-accent-b":             String(Int(b * 255)),
      "--nv-font-body":       fontSizes.body,
      "--nv-font-callout":    fontSizes.callout,
      "--nv-font-caption1":   fontSizes.caption1,
      "--nv-font-caption2":   fontSizes.caption2,
      "--nv-font-footnote":   fontSizes.footnote,
      "--nv-font-headline":   fontSizes.headline,
      "--nv-font-subheadline":fontSizes.subheadline,
      "--nv-font-title1":     fontSizes.title1,
      "--nv-font-title2":     fontSizes.title2,
      "--nv-font-title3":     fontSizes.title3,
      "--nv-font-largeTitle": fontSizes.largeTitle,
    ]

    patch(vars)
  }
${sharedChrome}
${sharedHelpers}

  private struct FontSizes {
    var body, callout, caption1, caption2, footnote,
        headline, subheadline, title1, title2, title3, largeTitle: String
  }

  private func macOSFontSizes() -> FontSizes {
    // macOS system font sizes — matched to Apple's HIG defaults
    return FontSizes(
      body:         "13px",
      callout:      "12px",
      caption1:     "10px",
      caption2:     "10px",
      footnote:     "10px",
      headline:     "13px",
      subheadline:  "11px",
      title1:       "22px",
      title2:       "17px",
      title3:       "15px",
      largeTitle:   "26px"
    )
  }
}`;

  return `${iosVars}

${macosVars}
#endif
`;
}
