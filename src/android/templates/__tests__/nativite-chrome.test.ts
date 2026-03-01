import { describe, expect, it } from "bun:test";

import { androidConfig } from "../../../__tests__/fixtures.ts";
import { nativiteChromeTemplate } from "../nativite-chrome.ts";

describe("nativiteChromeTemplate", () => {
  it("uses the correct package name", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("package com.example.testapp");
  });

  it("includes NativiteApp composable with Scaffold", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("fun NativiteApp(bridge: NativiteBridge)");
    expect(output).toContain("Scaffold(");
  });

  it("renders TitleBar as TopAppBar", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("fun NativiteTitleBar(");
    expect(output).toContain("TopAppBar(");
    expect(output).toContain("LargeTopAppBar(");
  });

  it("renders NavigationBar with NavigationBarItem", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("fun NativiteNavigationBar(");
    expect(output).toContain("NavigationBar {");
    expect(output).toContain("NavigationBarItem(");
  });

  it("renders Toolbar as BottomAppBar", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("fun NativiteToolbar(");
    expect(output).toContain("BottomAppBar {");
  });

  it("renders Sheets as ModalBottomSheet", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("fun NativiteSheet(");
    expect(output).toContain("ModalBottomSheet(");
  });

  it("handles back button via BackHandler", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("BackHandler");
    expect(output).toContain("navigation.backPressed");
  });

  it("includes SF Symbol to Material Icon mapping", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("fun sfSymbolToMaterialIcon(");
    expect(output).toContain("Icons.Default.Add");
    expect(output).toContain("Icons.Default.Search");
    expect(output).toContain("Icons.Default.Settings");
  });

  it("sends events with item IDs for navigation", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain('"navigation.itemPressed"');
    expect(output).toContain('"titleBar.leadingItemPressed"');
    expect(output).toContain('"titleBar.trailingItemPressed"');
    expect(output).toContain('"toolbar.itemPressed"');
  });

  it("supports badge rendering on navigation items", () => {
    const output = nativiteChromeTemplate(androidConfig);
    expect(output).toContain("BadgedBox");
    expect(output).toContain("Badge {");
  });
});
