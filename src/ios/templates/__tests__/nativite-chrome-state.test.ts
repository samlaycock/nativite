import { describe, expect, it } from "bun:test";

import { nativiteChromeStateTemplate } from "../nativite-chrome-state.ts";

describe("nativiteChromeStateTemplate", () => {
  it("enables WKWebView inspection in DEBUG builds for macOS child webviews", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain("if #available(iOS 16.4, *)");
    expect(output).toContain("if #available(macOS 13.3, *)");
    expect(output).toContain("webView.isInspectable = true");
  });

  it("includes macOS SwiftUI title bar and toolbar modifiers", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain("struct NativiteMacTitleBarModifier: ViewModifier");
    expect(output).toContain("struct NativiteMacToolbarModifier: ViewModifier");
    expect(output).toContain('eventName: "titleBar.leadingItemPressed"');
    expect(output).toContain('eventName: "toolbar.itemPressed"');
    expect(output).toContain(".searchable(");
  });

  it("includes macOS SwiftUI navigation/sidebar/drawer/popover/app-window modifiers and menu commands", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain("struct NativiteMacNavigationModifier: ViewModifier");
    expect(output).toContain("struct NativiteMacSidebarModifier: ViewModifier");
    expect(output).toContain("struct NativiteMacDrawersModifier: ViewModifier");
    expect(output).toContain("struct NativiteMacPopoversModifier: ViewModifier");
    expect(output).toContain("struct NativiteMacAppWindowsModifier: ViewModifier");
    expect(output).toContain("struct NativiteMenuBarCommands: Commands");
    expect(output).toContain('CommandMenu("Nativite")');
    expect(output).toContain('"navigation.itemPressed"');
    expect(output).toContain('"sidebarPanel.itemPressed"');
    expect(output).toContain('"menuBar.itemPressed"');
  });

  it("avoids top-level ForEach in toolbar content builders", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).not.toContain(
      "ForEach(Array(chromeState.toolbarGroups.enumerated()), id: \\.offset)",
    );
    expect(output).toContain("toolbarGroupContent(for: .automatic)");
  });

  it("builds menu content with AnyView helpers", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain(
      "private func menuItems(_ items: [NativiteChromeState.MenuItemState]) -> AnyView",
    );
    expect(output).toContain(
      "private func menuButton(_ item: NativiteChromeState.MenuItemState) -> AnyView",
    );
    expect(output).not.toContain("@CommandsBuilder\n  private func menuItems");
    expect(output).not.toContain("@CommandsBuilder\n  private func menuButton");
  });

  it("uses hyphenated flexible-space and fixed-space toolbar item types", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain('"flexible-space"');
    expect(output).toContain('"fixed-space"');
    expect(output).not.toContain('"flexibleSpace"');
    expect(output).not.toContain('"fixedSpace"');
  });

  it("includes macOS toolbar placement support", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain("enum ToolbarPlacement: String");
    expect(output).toContain("case principal");
    expect(output).toContain("case secondaryAction");
    expect(output).toContain("struct ToolbarGroupState");
    expect(output).toContain("var toolbarGroups: [ToolbarGroupState]");
  });

  it("includes macOS toolbar customisation support", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain("var toolbarCustomizable: Bool");
    expect(output).toContain("var toolbarId: String?");
    expect(output).toContain("enum CustomizationBehavior: String");
    expect(output).toContain(".customizationBehavior");
    expect(output).toContain('id: "nativite.toolbar.\\(placement.rawValue)"');
    expect(output).toContain("CustomizableToolbarContent");
  });

  it("includes macOS toolbar display mode support", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain("enum ToolbarDisplayMode: String");
    expect(output).toContain("case iconAndLabel");
    expect(output).toContain("case iconOnly");
    expect(output).toContain("case labelOnly");
    expect(output).toContain("var toolbarDisplayMode: ToolbarDisplayMode");
    expect(output).toContain("displayMode: chromeState.toolbarDisplayMode");
  });

  it("includes macOS toolbar style support", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain('var toolbarStyle: String = "unified"');
  });

  it("updateToolbar handles groups and macOS properties", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain('state["groups"]');
    expect(output).toContain('state["customizable"]');
    expect(output).toContain('state["displayMode"]');
    expect(output).toContain('state["toolbarStyle"]');
  });

  it("resetToolbar resets all macOS toolbar properties", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain("toolbarGroups = []");
    expect(output).toContain("toolbarCustomizable = false");
    expect(output).toContain("toolbarId = nil");
    expect(output).toContain("toolbarDisplayMode = .iconAndLabel");
  });

  it("NativiteMacBarButton accepts a displayMode parameter", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain(
      "var displayMode: NativiteChromeState.ToolbarDisplayMode = .iconAndLabel",
    );
  });

  it("parseBarItem handles customization property", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain('state["customization"]');
    expect(output).toContain("item.customization = BarItemState.CustomizationBehavior");
  });

  it("sets underPageBackgroundColor on child webviews for dark-mode-aware overscroll", () => {
    const output = nativiteChromeStateTemplate();
    // iOS child webview should use .systemBackground
    expect(output).toContain("webView.underPageBackgroundColor = .systemBackground");
    // macOS child webview should use .windowBackgroundColor
    expect(output).toContain("webView.underPageBackgroundColor = .windowBackgroundColor");
  });

  it("injects color-scheme declaration into child webview user scripts for prefers-color-scheme support", () => {
    const output = nativiteChromeStateTemplate();
    expect(output).toContain("color-scheme:light dark");
  });
});
