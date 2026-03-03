import { describe, expect, it } from "bun:test";

import { androidConfig } from "../../../__tests__/fixtures.ts";
import { nativiteChromeTemplate } from "../nativite-chrome.ts";

describe("nativiteChromeTemplate", () => {
  const output = nativiteChromeTemplate(androidConfig);

  it("uses the correct package name", () => {
    expect(output).toContain("package com.example.testapp");
  });

  it("includes NativiteApp composable with Scaffold", () => {
    expect(output).toContain("fun NativiteApp(bridge: NativiteBridge)");
    expect(output).toContain("Scaffold(");
  });

  // ─── TitleBar ──────────────────────────────────────────────────────────

  it("renders TitleBar as TopAppBar", () => {
    expect(output).toContain("fun NativiteTitleBar(");
    expect(output).toContain("TopAppBar(");
    expect(output).toContain("LargeTopAppBar(");
  });

  it("reads largeTitleMode instead of prefersLargeTitles", () => {
    expect(output).toContain('titleBar?.get("largeTitleMode")');
    expect(output).not.toContain("prefersLargeTitles");
  });

  it("uses composable scrollBehavior conditionally based on useLargeTitle", () => {
    expect(output).toContain("exitUntilCollapsedScrollBehavior()");
    expect(output).toContain("val useLargeTitle");
  });

  it("supports hidden title bar", () => {
    expect(output).toContain('titleBar["hidden"] != true');
  });

  it("supports title bar subtitle", () => {
    expect(output).toContain('config["subtitle"] as? String');
    expect(output).toContain("MaterialTheme.typography.bodySmall");
  });

  it("supports title bar tint color", () => {
    expect(output).toContain('parseTintColor(config["tint"]');
    expect(output).toContain("actionIconContentColor = tintColor");
    expect(output).toContain("navigationIconContentColor = tintColor");
  });

  it("supports title bar search bar", () => {
    expect(output).toContain("fun NativiteTitleBarSearch(");
    expect(output).toContain('"titleBar.searchChanged"');
    expect(output).toContain('"titleBar.searchCancelled"');
  });

  // ─── NavigationBar ─────────────────────────────────────────────────────

  it("renders NavigationBar with NavigationBarItem", () => {
    expect(output).toContain("fun NativiteNavigationBar(");
    expect(output).toContain("NavigationBar {");
    expect(output).toContain("NavigationBarItem(");
  });

  it("reads label property instead of title on nav items", () => {
    expect(output).toContain('item["label"] as? String');
    // Should not read item["title"] anywhere in NavigationBar
    expect(output).not.toContain('item["title"]');
  });

  it("supports hidden navigation bar", () => {
    expect(output).toContain('navigation["hidden"] != true');
  });

  it("supports disabled navigation items", () => {
    expect(output).toContain('item["disabled"] as? Boolean');
    expect(output).toContain("enabled = !disabled");
  });

  it("supports navigation item subtitle", () => {
    expect(output).toContain('item["subtitle"] as? String');
  });

  // ─── Toolbar ───────────────────────────────────────────────────────────

  it("renders Toolbar as BottomAppBar", () => {
    expect(output).toContain("fun NativiteToolbar(");
    expect(output).toContain("BottomAppBar {");
  });

  it("supports hidden toolbar", () => {
    expect(output).toContain('toolbar["hidden"] != true');
  });

  // ─── Sheets ────────────────────────────────────────────────────────────

  it("renders Sheets as ModalBottomSheet", () => {
    expect(output).toContain("fun NativiteSheet(");
    expect(output).toContain("ModalBottomSheet(");
  });

  it("supports sheet detent mapping with fractional heights", () => {
    expect(output).toContain('"small" -> 0.25f');
    expect(output).toContain('"medium" -> 0.5f');
    expect(output).toContain('"large" -> 0.75f');
    expect(output).toContain('"full" -> 1.0f');
    expect(output).toContain("fillMaxHeight(heightFraction)");
  });

  it("supports sheet dismissible property", () => {
    expect(output).toContain('config["dismissible"] as? Boolean');
    expect(output).toContain("confirmValueChange = { dismissible }");
  });

  it("supports sheet corner radius", () => {
    expect(output).toContain('config["cornerRadius"] as? Number');
    expect(output).toContain("RoundedCornerShape(topStart = cornerRadius.dp");
  });

  it("supports sheet background color", () => {
    expect(output).toContain('parseTintColor(config["backgroundColor"]');
    expect(output).toContain("containerColor = bgColor");
  });

  it("fires sheet lifecycle events", () => {
    expect(output).toContain('"sheet.presented"');
    expect(output).toContain('"sheet.dismissed"');
    expect(output).toContain('"sheet.detentChanged"');
  });

  it("animates sheet close when presented becomes false", () => {
    expect(output).toContain("sheetState.hide()");
    expect(output).toContain("var showSheet by remember");
  });

  it("iterates all configured sheets, not just presented ones", () => {
    expect(output).toContain("NativiteSheet(name.toString(), config, bridge)");
    expect(output).not.toContain("if (presented) {\n                NativiteSheet(");
  });

  // ─── BarItemButton ─────────────────────────────────────────────────────

  it("supports disabled bar items", () => {
    expect(output).toContain('item["disabled"] as? Boolean');
  });

  it("supports badge on bar items", () => {
    expect(output).toContain("BadgedBox");
    expect(output).toContain("Badge {");
  });

  it("supports per-button tint color", () => {
    expect(output).toContain('parseTintColor(item["tint"]');
  });

  it("shows text label when no icon", () => {
    expect(output).toContain("TextButton(");
    expect(output).toContain("Text(label, color = resolvedTint)");
  });

  // ─── Menus ─────────────────────────────────────────────────────────────

  it("supports dropdown menus on bar items", () => {
    expect(output).toContain("fun NativiteDropdownMenu(");
    expect(output).toContain("DropdownMenu(");
    expect(output).toContain("DropdownMenuItem(");
  });

  it("fires menu item pressed events", () => {
    expect(output).toContain('"titleBar.menuItemPressed"');
    expect(output).toContain('"toolbar.menuItemPressed"');
  });

  // ─── StatusBar ─────────────────────────────────────────────────────────

  it("supports status bar control", () => {
    expect(output).toContain("fun NativiteStatusBar(");
    expect(output).toContain("WindowCompat.getInsetsController");
    expect(output).toContain("isAppearanceLightStatusBars");
    expect(output).toContain("WindowInsetsCompat.Type.statusBars()");
  });

  // ─── HomeIndicator ─────────────────────────────────────────────────────

  it("supports home indicator (system nav bar) control", () => {
    expect(output).toContain("fun NativiteHomeIndicator(");
    expect(output).toContain("WindowInsetsCompat.Type.navigationBars()");
    expect(output).toContain("BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE");
  });

  // ─── Drawers ───────────────────────────────────────────────────────────

  it("supports drawer rendering", () => {
    expect(output).toContain("fun NativiteDrawers(");
    expect(output).toContain("ModalNavigationDrawer(");
    expect(output).toContain("ModalDrawerSheet(");
  });

  it("fires drawer lifecycle events via state observation", () => {
    expect(output).toContain('"drawer.presented"');
    expect(output).toContain('"drawer.dismissed"');
    // Events fire based on drawerState transitions, not LaunchedEffect(name)
    expect(output).toContain("LaunchedEffect(drawerState.currentValue)");
  });

  it("retains drawer config during close animation", () => {
    expect(output).toContain("lastDrawerName");
    expect(output).toContain("lastDrawerConfig");
  });

  it("supports trailing drawer side via layout direction flip", () => {
    expect(output).toContain('activeConfig["side"]');
    expect(output).toContain("LocalLayoutDirection");
    expect(output).toContain("LayoutDirection.Rtl");
  });

  // ─── Keyboard Accessory ────────────────────────────────────────────────

  it("supports keyboard accessory", () => {
    expect(output).toContain("fun NativiteKeyboardAccessory(");
    expect(output).toContain("WindowInsets.ime");
    expect(output).toContain("AnimatedVisibility(");
    expect(output).toContain('"keyboard.itemPressed"');
  });

  // ─── Popovers ──────────────────────────────────────────────────────────

  it("supports popovers", () => {
    expect(output).toContain("fun NativitePopover(");
    expect(output).toContain("Popup(");
    expect(output).toContain('"popover.presented"');
    expect(output).toContain('"popover.dismissed"');
  });

  // ─── TabBottomAccessory ────────────────────────────────────────────────

  it("supports tab bottom accessory", () => {
    expect(output).toContain("fun NativiteTabBottomAccessory(");
    expect(output).toContain('"tabBottomAccessory.presented"');
  });

  // ─── Events ────────────────────────────────────────────────────────────

  it("sends events with item IDs for navigation", () => {
    expect(output).toContain('"navigation.itemPressed"');
    expect(output).toContain('"titleBar.leadingItemPressed"');
    expect(output).toContain('"titleBar.trailingItemPressed"');
    expect(output).toContain('"toolbar.itemPressed"');
  });

  it("handles back button via BackHandler", () => {
    expect(output).toContain("BackHandler");
    expect(output).toContain("navigation.backPressed");
  });

  // ─── Icon Mapping ──────────────────────────────────────────────────────

  it("resolves Material Icons dynamically via reflection", () => {
    expect(output).toContain("fun materialIcon(");
    expect(output).toContain("source.javaClass.methods.firstOrNull");
    expect(output).toContain("Icons.Default");
    expect(output).toContain("Icons.AutoMirrored.Filled");
    expect(output).toContain("iconCache");
  });

  // ─── Color Parsing ─────────────────────────────────────────────────────

  it("includes parseTintColor helper", () => {
    expect(output).toContain("fun parseTintColor(hex: String?): Color?");
    expect(output).toContain("trimStart('#')");
    expect(output).toContain("toLongOrNull(16)");
  });

  // ─── State Parsing ─────────────────────────────────────────────────────

  it("reads all chrome state areas in NativiteApp", () => {
    expect(output).toContain('chromeState["titleBar"]');
    expect(output).toContain('chromeState["navigation"]');
    expect(output).toContain('chromeState["toolbar"]');
    expect(output).toContain('chromeState["sheets"]');
    expect(output).toContain('chromeState["drawers"]');
    expect(output).toContain('chromeState["statusBar"]');
    expect(output).toContain('chromeState["homeIndicator"]');
    expect(output).toContain('chromeState["keyboard"]');
    expect(output).toContain('chromeState["popovers"]');
    expect(output).toContain('chromeState["tabBottomAccessory"]');
  });
});
