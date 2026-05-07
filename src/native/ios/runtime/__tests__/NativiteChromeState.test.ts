import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "../NativiteChromeState.swift")).text();

describe("NativiteChromeState.swift", () => {
  it("enables WKWebView inspection in DEBUG builds", () => {
    expect(swift).toContain("if #available(iOS 16.4, *)");
    expect(swift).toContain("if #available(macOS 13.3, *)");
    expect(swift).toContain("webView.isInspectable = true");
  });

  it("includes macOS SwiftUI title bar and toolbar modifiers", () => {
    expect(swift).toContain("struct NativiteMacTitleBarModifier: ViewModifier");
    expect(swift).toContain("struct NativiteMacToolbarModifier: ViewModifier");
    expect(swift).toContain('eventName: "titleBar.leadingItemPressed"');
    expect(swift).toContain('eventName: "toolbar.itemPressed"');
    expect(swift).toContain(".searchable(");
  });

  it("includes macOS SwiftUI navigation/sidebar/drawer/popover/app-window modifiers and menu commands", () => {
    expect(swift).toContain("struct NativiteMacNavigationModifier: ViewModifier");
    expect(swift).toContain("struct NativiteMacSidebarModifier: ViewModifier");
    expect(swift).toContain("struct NativiteMacDrawersModifier: ViewModifier");
    expect(swift).toContain("struct NativiteMacPopoversModifier: ViewModifier");
    expect(swift).toContain("struct NativiteMacAppWindowsModifier: ViewModifier");
    expect(swift).toContain("struct NativiteMenuBarCommands: Commands");
    expect(swift).toContain('CommandMenu("Nativite")');
    expect(swift).toContain('"navigation.itemPressed"');
    expect(swift).toContain('"sidebarPanel.itemPressed"');
    expect(swift).toContain('"menuBar.itemPressed"');
  });

  it("avoids top-level ForEach in toolbar content builders", () => {
    expect(swift).not.toContain(
      "ForEach(Array(chromeState.toolbarGroups.enumerated()), id: \\.offset)",
    );
    expect(swift).toContain("toolbarGroupContent(for: .automatic)");
  });

  it("builds menu content with AnyView helpers", () => {
    expect(swift).toContain(
      "private func menuItems(_ items: [NativiteChromeState.MenuItemState]) -> AnyView",
    );
    expect(swift).toContain(
      "private func menuButton(_ item: NativiteChromeState.MenuItemState) -> AnyView",
    );
    expect(swift).not.toContain("@CommandsBuilder\n  private func menuItems");
    expect(swift).not.toContain("@CommandsBuilder\n  private func menuButton");
  });

  it("uses hyphenated flexible-space and fixed-space toolbar item types", () => {
    expect(swift).toContain('"flexible-space"');
    expect(swift).toContain('"fixed-space"');
    expect(swift).not.toContain('"flexibleSpace"');
    expect(swift).not.toContain('"fixedSpace"');
  });

  it("includes macOS toolbar placement support", () => {
    expect(swift).toContain("enum ToolbarPlacement: String");
    expect(swift).toContain("case principal");
    expect(swift).toContain("case secondaryAction");
    expect(swift).toContain("struct ToolbarGroupState");
    expect(swift).toContain("var toolbarGroups: [ToolbarGroupState]");
  });

  it("includes macOS toolbar customisation support", () => {
    expect(swift).toContain("var toolbarCustomizable: Bool");
    expect(swift).toContain("var toolbarId: String?");
    expect(swift).toContain("enum CustomizationBehavior: String");
    expect(swift).toContain(".customizationBehavior");
    expect(swift).toContain('id: "nativite.toolbar.\\(placement.rawValue)"');
    expect(swift).toContain("CustomizableToolbarContent");
  });

  it("includes macOS toolbar display mode support", () => {
    expect(swift).toContain("enum ToolbarDisplayMode: String");
    expect(swift).toContain("case iconAndLabel");
    expect(swift).toContain("case iconOnly");
    expect(swift).toContain("case labelOnly");
    expect(swift).toContain("var toolbarDisplayMode: ToolbarDisplayMode");
    expect(swift).toContain("displayMode: chromeState.toolbarDisplayMode");
  });

  it("includes macOS toolbar style support", () => {
    expect(swift).toContain('var toolbarStyle: String = "unified"');
  });

  it("updateToolbar handles groups and macOS properties", () => {
    expect(swift).toContain('state["groups"]');
    expect(swift).toContain('state["customizable"]');
    expect(swift).toContain('state["displayMode"]');
    expect(swift).toContain('state["toolbarStyle"]');
  });

  it("resetToolbar resets all macOS toolbar properties", () => {
    expect(swift).toContain("toolbarGroups = []");
    expect(swift).toContain("toolbarCustomizable = false");
    expect(swift).toContain("toolbarId = nil");
    expect(swift).toContain("toolbarDisplayMode = .iconAndLabel");
  });

  it("NativiteMacBarButton accepts a displayMode parameter", () => {
    expect(swift).toContain(
      "var displayMode: NativiteChromeState.ToolbarDisplayMode = .iconAndLabel",
    );
  });

  it("parseBarItem handles customization property", () => {
    expect(swift).toContain('state["customization"]');
    expect(swift).toContain("item.customization = BarItemState.CustomizationBehavior");
  });

  it("parses and renders navigation item tint", () => {
    expect(swift).toContain("var tint: String?");
    expect(swift).toContain('item.tint = state["tint"] as? String');
    expect(swift).toContain("Label(item.label, systemImage: icon).tint(item.resolvedTint)");
    expect(swift).toContain("Text(item.label).tint(item.resolvedTint)");
  });

  it("sets underPageBackgroundColor on child webviews for dark-mode-aware overscroll", () => {
    expect(swift).toContain("webView.underPageBackgroundColor = .systemBackground");
    expect(swift).toContain("webView.underPageBackgroundColor = .windowBackgroundColor");
  });

  it("injects color-scheme declaration into child webview user scripts", () => {
    expect(swift).toContain("color-scheme:light dark");
  });

  it("sets data-nv-theme attribute on child webview documentElement", () => {
    expect(swift).toContain("data-nv-theme");
  });

  it("fires correct menu event names from iOS NativiteBarButton", () => {
    expect(swift).toContain('var menuEventName: String = "titleBar.menuItemPressed"');
    expect(swift).toContain('menuEventName: "toolbar.menuItemPressed"');
    expect(swift).not.toContain('replacingOccurrences(of: "ItemPressed"');
  });

  it("renders sheet header chrome with title and bar items", () => {
    expect(swift).toContain("sheet.title");
    expect(swift).toContain("sheet.leadingItems");
    expect(swift).toContain("sheet.trailingItems");
    expect(swift).toContain('eventName: "sheet.leadingItemPressed"');
    expect(swift).toContain('eventName: "sheet.trailingItemPressed"');
    expect(swift).toContain('menuEventName: "sheet.leadingItemPressed"');
    expect(swift).toContain('menuEventName: "sheet.trailingItemPressed"');
    expect(swift).toContain("NavigationStack");
  });

  it("passes full NCLP node IDs back to the bridge when available", () => {
    expect(swift).toContain("var nclpId: String?");
    expect(swift).toContain('item.nclpId = state["nclpId"] as? String');
    expect(swift).toContain("menuItem.nclpId ?? menuItem.id");
    expect(swift).toContain("item.nclpId ?? item.id");
  });
});
