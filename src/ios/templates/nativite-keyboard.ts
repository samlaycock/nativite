import type { NativiteConfig } from "../../index.ts";

// NativiteKeyboard is only included in the project when the consumer
// may use keyboard.inputAccessory state. We always include it so the
// bridge can wire it up at startup.
export function nativiteKeyboardTemplate(_config: NativiteConfig): string {
  return `#if os(iOS)
import UIKit
import WebKit

// ─── NativiteWebView ─────────────────────────────────────────────────────────
// UIResponder.inputAccessoryView is a get-only property; it can only be
// provided by overriding it in a subclass. NativiteWebView is a minimal
// WKWebView subclass whose sole purpose is to expose a settable
// inputAccessoryView so NativiteKeyboard can attach its accessory bar.

class NativiteWebView: WKWebView {
  var customInputAccessoryView: UIView?
  // When true, pins root scroll position at y=0 to prevent keyboard-driven
  // document shifts. Keep enabled for the primary app webview.
  var lockRootScroll: Bool = true

  override var inputAccessoryView: UIView? {
    customInputAccessoryView
  }

  override init(frame: CGRect, configuration: WKWebViewConfiguration) {
    super.init(frame: frame, configuration: configuration)
    scrollView.delegate = self
  }

  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }
}

extension NativiteWebView: UIScrollViewDelegate {
  // WKWebView programmatically adjusts scrollView.contentOffset to scroll
  // focused inputs into view when the keyboard appears — this bypasses
  // isScrollEnabled entirely. Resetting it here keeps the WebView pinned
  // in place so the keyboard overlays rather than pushes the content.
  // Inner overflow:scroll/auto elements have their own nested UIScrollViews
  // inside WKWebView and are completely unaffected by this.
  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    guard lockRootScroll else { return }
    if scrollView.contentOffset.y != 0 {
      scrollView.contentOffset = CGPoint(x: scrollView.contentOffset.x, y: 0)
    }
  }
}

// NativiteKeyboard manages the native input accessory view shown above
// the software keyboard. It is installed via NativiteWebView so it
// animates with the keyboard frame automatically.
//
// JS usage:
//   chrome.keyboard.setAccessory({
//     items: [{ type: "button", id: "done", title: "Done" }],
//   })
//   chrome.keyboard.configure({ dismissMode: "interactive" })
class NativiteKeyboard: NSObject {

  weak var viewController: ViewController?
  weak var vars: NativiteVars?

  // The custom input accessory view attached to the web view.
  private let accessoryView = NativiteAccessoryView()

  // ── Setup ─────────────────────────────────────────────────────────────────

  func install(on webView: NativiteWebView) {
    accessoryView.keyboard = self
    webView.customInputAccessoryView = accessoryView
  }

  // ── State Application ─────────────────────────────────────────────────────

  func applyState(_ state: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      // dismissMode
      if let mode = state["dismissMode"] as? String,
         let scrollView = self.viewController?.webView?.scrollView {
        switch mode {
        case "onDrag":      scrollView.keyboardDismissMode = .onDrag
        case "interactive": scrollView.keyboardDismissMode = .interactive
        default:            scrollView.keyboardDismissMode = .none
        }
      }

      // accessory
      if state["accessory"] is NSNull {
        // Explicit null — hide the bar and tell vars the height is 0.
        self.accessoryView.isHidden = true
        self.vars?.updateAccessoryHeight(0)
        return
      }
      if let accessory = state["accessory"] as? [String: Any] {
        self.accessoryView.isHidden = false
        if let items = accessory["items"] as? [[String: Any]] {
          self.accessoryView.setItems(items, keyboard: self)
        }
        // Report height to NativiteVars after layout.
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          let h = self.accessoryView.isHidden ? 0.0 : self.accessoryView.reportedHeight
          self.vars?.updateAccessoryHeight(h)
        }
      }
    }
  }

  // ── Event helper ──────────────────────────────────────────────────────────

  func sendItemPressed(id: String) {
    viewController?.sendToWebView([
      "id": NSNull(),
      "type": "event",
      "event": "keyboard.itemPressed",
      "data": ["id": id],
    ])
  }
}

// ─── NativiteAccessoryView ───────────────────────────────────────────────────
// A lightweight UIInputView subclass that renders a UIToolbar-style bar.
// Using UIInputView (rather than plain UIView) gives the correct height
// sizing on all iPhone form factors, including the dynamic island.

private class NativiteAccessoryView: UIInputView {

  weak var keyboard: NativiteKeyboard?
  private let toolbarHeight: CGFloat = 44
  private let keyboardTopGap: CGFloat = 6
  private var accessoryHeight: CGFloat { toolbarHeight + keyboardTopGap }
  private var toolbar: UIToolbar!

  var barTintColor: UIColor? {
    didSet { toolbar?.barTintColor = barTintColor }
  }

  init() {
    // Compute height before super.init — Swift's two-phase init forbids
    // accessing self (including computed properties) before super.init,
    // even when the underlying stored properties already have values.
    let height = toolbarHeight + keyboardTopGap
    super.init(frame: CGRect(x: 0, y: 0, width: 0, height: height),
               inputViewStyle: .keyboard)

    backgroundColor = .clear

    toolbar = UIToolbar(frame: .zero)
    toolbar.translatesAutoresizingMaskIntoConstraints = false
    addSubview(toolbar)
    toolbar.leadingAnchor.constraint(equalTo: leadingAnchor).isActive = true
    toolbar.trailingAnchor.constraint(equalTo: trailingAnchor).isActive = true
    toolbar.topAnchor.constraint(equalTo: topAnchor).isActive = true
    toolbar.heightAnchor.constraint(equalToConstant: toolbarHeight).isActive = true
  }

  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

  override var intrinsicContentSize: CGSize {
    CGSize(width: UIView.noIntrinsicMetric, height: accessoryHeight)
  }

  var reportedHeight: CGFloat {
    accessoryHeight
  }

  func setItems(_ itemStates: [[String: Any]], keyboard: NativiteKeyboard) {
    toolbar.items = itemStates.compactMap { makeToolbarItem($0, keyboard: keyboard) }
    invalidateIntrinsicContentSize()
  }

  private func makeToolbarItem(_ state: [String: Any], keyboard: NativiteKeyboard) -> UIBarButtonItem? {
    switch state["type"] as? String {
    case "flexible-space":
      return UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)

    case "fixed-space":
      let item = UIBarButtonItem(barButtonSystemItem: .fixedSpace, target: nil, action: nil)
      item.width = state["width"] as? CGFloat ?? 8
      return item

    default: // "button"
      guard let id = state["id"] as? String else { return nil }

      let barItem: UIBarButtonItem
      let style: UIBarButtonItem.Style = (state["style"] as? String) == "primary" ? .done : .plain

      if let symbolName = state["icon"] as? String,
         let image = UIImage(systemName: symbolName) {
        barItem = UIBarButtonItem(image: image, style: style, target: keyboard,
                                  action: #selector(NativiteKeyboard.accessoryButtonTapped(_:)))
      } else if let label = state["label"] as? String {
        barItem = UIBarButtonItem(title: label, style: style, target: keyboard,
                                  action: #selector(NativiteKeyboard.accessoryButtonTapped(_:)))
      } else {
        return nil
      }

      barItem.accessibilityIdentifier = id
      barItem.isEnabled = !((state["disabled"] as? Bool) ?? false)
      return barItem
    }
  }
}

// ─── UIColor hex extension ────────────────────────────────────────────────────

private extension UIColor {
  convenience init(hex: String) {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.hasPrefix("#") { cleaned.removeFirst() }
    let value = UInt64((cleaned.count == 6 ? cleaned + "FF" : cleaned), radix: 16) ?? 0xFFFFFFFF
    let r = CGFloat((value >> 24) & 0xFF) / 255
    let g = CGFloat((value >> 16) & 0xFF) / 255
    let b = CGFloat((value >> 8)  & 0xFF) / 255
    let a = CGFloat(value         & 0xFF) / 255
    self.init(red: r, green: g, blue: b, alpha: a)
  }
}

// ─── Selector target (must be on the class itself, not nested types) ──────────

extension NativiteKeyboard {
  @objc fileprivate func accessoryButtonTapped(_ sender: UIBarButtonItem) {
    guard let id = sender.accessibilityIdentifier else { return }
    sendItemPressed(id: id)
  }
}
#endif
`;
}
