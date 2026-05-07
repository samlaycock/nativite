import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "../NativiteChrome.swift")).text();
const macStart = swift.indexOf("#elseif os(macOS)");
const iosSection = swift.slice(0, macStart > 0 ? macStart : undefined);

describe("NativiteChrome.swift", () => {
  describe("iOS title bar — SwiftUI delegation", () => {
    it("applyTitleBar delegates to chromeState.updateTitleBar", () => {
      const start = swift.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = swift.indexOf("\n  // ──", start + 1);
      const body = end !== -1 ? swift.slice(start, end) : swift.slice(start, start + 300);
      expect(body).toContain("chromeState?.updateTitleBar(state)");
    });

    it("applyTitleBar does not use UINavigationItem or UIBarButtonItem", () => {
      const start = swift.indexOf("func applyTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = swift.indexOf("\n  // ──", start + 1);
      const body = end !== -1 ? swift.slice(start, end) : swift.slice(start, start + 300);
      expect(body).not.toContain("navItem");
      expect(body).not.toContain("navigationController");
      expect(body).not.toContain("setNavigationBarHidden");
      expect(body).not.toContain("UIBarButtonItem");
    });

    it("resetTitleBar delegates to chromeState.resetTitleBar", () => {
      const start = swift.indexOf("func resetTitleBar");
      expect(start).toBeGreaterThan(-1);
      const end = swift.indexOf("\n  /// ", start + 1);
      const body = end !== -1 ? swift.slice(start, end) : swift.slice(start, start + 300);
      expect(body).toContain("chromeState?.resetTitleBar()");
    });

    it("no longer contains UIBarButtonItem building code in iOS section", () => {
      expect(iosSection).not.toContain("func barButtonItem(");
      expect(iosSection).not.toContain("func barButtonMenu(");
      expect(iosSection).not.toContain("func barButtonMenuElement(");
      expect(iosSection).not.toContain("func barButtonTapped(");
      expect(iosSection).not.toContain("barItemCache");
    });

    it("no longer contains legacy applySearchBar method for title bar", () => {
      expect(iosSection).not.toContain("func applySearchBar(");
    });
  });

  describe("iOS toolbar — SwiftUI delegation", () => {
    it("applyToolbar delegates to chromeState.updateToolbar", () => {
      const start = swift.indexOf("func applyToolbar");
      expect(start).toBeGreaterThan(-1);
      const end = swift.indexOf("\n  // ──", start + 1);
      const body = end !== -1 ? swift.slice(start, end) : swift.slice(start, start + 300);
      expect(body).toContain("chromeState?.updateToolbar(state)");
    });

    it("applyToolbar does not use UINavigationController toolbar", () => {
      const start = swift.indexOf("func applyToolbar");
      expect(start).toBeGreaterThan(-1);
      const end = swift.indexOf("\n  // ──", start + 1);
      const body = end !== -1 ? swift.slice(start, end) : swift.slice(start, start + 300);
      expect(body).not.toContain("setToolbarHidden");
      expect(body).not.toContain("setToolbarItems");
      expect(body).not.toContain("navigationController");
    });

    it("resetToolbar delegates to chromeState.resetToolbar", () => {
      const start = swift.indexOf("func resetToolbar");
      expect(start).toBeGreaterThan(-1);
      const body = swift.slice(start, start + 200);
      expect(body).toContain("chromeState?.resetToolbar()");
    });

    it("no legacy toolbarButtonTapped dead-code method", () => {
      expect(swift).not.toContain("func toolbarButtonTapped");
    });
  });

  describe("iOS onChromeEvent callback wiring", () => {
    it("wires onChromeEvent in applyState so SwiftUI views can send events", () => {
      const start = swift.indexOf("func applyState");
      expect(start).toBeGreaterThan(-1);
      const end = swift.indexOf("\n  // ── Title", start + 1);
      const body = end !== -1 ? swift.slice(start, end) : swift.slice(start, start + 800);
      expect(body).toContain("chromeState?.onChromeEvent == nil");
      expect(body).toContain("self?.sendEvent(name: name, data: data)");
    });

    it("emits NCLP chrome.event targets using full node identity when provided", () => {
      expect(swift).toContain("func nclpIdValue() -> String?");
      expect(swift).toContain('case "menuBar.itemPressed":');
      expect(swift).toContain('target = nclpIdValue() ?? "toolbar:\\(id)"');
      expect(swift).toContain('target = nclpIdValue() ?? "titleBar:trailing:menu:\\(id)"');
    });
  });

  describe("navigation (tab bar)", () => {
    it("branches on #available(iOS 18.0, *) in applyNavigation", () => {
      const start = swift.indexOf("func applyNavigation(");
      expect(start).toBeGreaterThan(-1);
      const body = swift.slice(start, start + 500);
      expect(body).toContain("#available(iOS 18.0, *)");
      expect(body).toContain("applyNavigationModern");
      expect(body).toContain("applyNavigationLegacy");
    });

    it("dispatches navigation.itemPressed when the user selects a tab", () => {
      expect(swift).toContain('"navigation.itemPressed"');
    });
  });

  describe("applyInitialState", () => {
    it("reads from NativiteConfig.defaultChromeStateJSON and guards on nil", () => {
      expect(swift).toContain("NativiteConfig.defaultChromeStateJSON");
      expect(swift).toContain("guard let jsonString = NativiteConfig.defaultChromeStateJSON");
    });
  });
});
