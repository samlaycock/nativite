import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const kt = await Bun.file(join(import.meta.dirname, "../NativiteChrome.kt")).text();

describe("NativiteChrome.kt", () => {
  it("includes NativiteApp composable with Scaffold", () => {
    expect(kt).toContain("fun NativiteApp(bridge: NativiteBridge)");
    expect(kt).toContain("Scaffold(");
  });

  it("measures rendered chrome geometry and reports it to the bridge", () => {
    expect(kt).toContain("onGloballyPositioned");
    expect(kt).toContain("bridge.updateRenderedChromeGeometry(");
    expect(kt).toContain("navHeightPx = if (titleBarVisible) topBarHeightPx else 0");
    expect(kt).toContain("tabHeightPx = if (navigationVisible) navigationHeightPx else 0");
    expect(kt).toContain("toolbarHeightPx = if (toolbarVisible) bottomToolbarHeightPx else 0");
  });

  it("renders TitleBar as TopAppBar", () => {
    expect(kt).toContain("fun NativiteTitleBar(");
    expect(kt).toContain("TopAppBar(");
    expect(kt).toContain("LargeTopAppBar(");
  });

  it("reads largeTitleMode instead of prefersLargeTitles", () => {
    expect(kt).toContain('titleBar?.get("largeTitleMode")');
    expect(kt).not.toContain("prefersLargeTitles");
  });

  it("uses composable scrollBehavior conditionally based on useLargeTitle", () => {
    expect(kt).toContain("exitUntilCollapsedScrollBehavior()");
    expect(kt).toContain("val useLargeTitle");
  });

  it("supports hidden title bar", () => {
    expect(kt).toContain('titleBar["hidden"] != true');
  });

  it("supports title bar subtitle", () => {
    expect(kt).toContain('config["subtitle"] as? String');
    expect(kt).toContain("MaterialTheme.typography.bodySmall");
  });

  it("supports title bar tint color", () => {
    expect(kt).toContain('parseTintColor(config["tint"]');
    expect(kt).toContain("actionIconContentColor = tintColor");
    expect(kt).toContain("navigationIconContentColor = tintColor");
  });

  it("supports title bar search bar", () => {
    expect(kt).toContain("fun NativiteTitleBarSearch(");
    expect(kt).toContain('"titleBar.searchChanged"');
    expect(kt).toContain('"titleBar.searchSubmitted"');
    expect(kt).toContain('"titleBar.searchCancelled"');
  });

  it("renders NavigationBar with NavigationBarItem", () => {
    expect(kt).toContain("fun NativiteNavigationBar(");
    expect(kt).toContain("NavigationBar {");
    expect(kt).toContain("NavigationBarItem(");
  });

  it("reads label property instead of title on nav items", () => {
    expect(kt).toContain('item["label"] as? String');
    expect(kt).not.toContain('item["title"]');
  });

  it("supports hidden navigation bar", () => {
    expect(kt).toContain('navigation["hidden"] != true');
  });

  it("supports disabled navigation items", () => {
    expect(kt).toContain('item["disabled"] as? Boolean');
    expect(kt).toContain("enabled = !disabled");
  });

  it("supports per-navigation-item tint color", () => {
    expect(kt).toContain('parseTintColor(item["tint"]');
    expect(kt).toContain("NavigationBarItemDefaults.colors(");
    expect(kt).toContain("selectedIconColor = tintColor");
    expect(kt).toContain("unselectedTextColor = tintColor");
  });

  it("supports navigation item subtitle", () => {
    expect(kt).toContain('item["subtitle"] as? String');
  });

  it("supports navigation search role and search bar config", () => {
    expect(kt).toContain('item["role"] as? String');
    expect(kt).toContain('config["searchBar"] as? Map<*, *>');
    expect(kt).toContain('"navigation.searchChanged"');
    expect(kt).toContain('"navigation.searchSubmitted"');
    expect(kt).toContain('"navigation.searchCancelled"');
  });

  it("renders Toolbar as BottomAppBar", () => {
    expect(kt).toContain("fun NativiteToolbar(");
    expect(kt).toContain("BottomAppBar {");
  });

  it("supports hidden toolbar", () => {
    expect(kt).toContain('toolbar["hidden"] != true');
  });

  it("flattens toolbar groups into items for bottom bar fallback", () => {
    expect(kt).toContain('config["groups"]');
    expect(kt).toContain('group["items"]');
  });

  it("renders Sheets as ModalBottomSheet", () => {
    expect(kt).toContain("fun NativiteSheet(");
    expect(kt).toContain("ModalBottomSheet(");
  });

  it("renders optional sheet header chrome with leading and trailing items", () => {
    expect(kt).toContain('config["title"] as? String');
    expect(kt).toContain('config["leadingItems"]');
    expect(kt).toContain('config["trailingItems"]');
    expect(kt).toContain('"sheet.leadingItemPressed"');
    expect(kt).toContain('"sheet.trailingItemPressed"');
    expect(kt).toContain("TopAppBar(");
  });

  it("supports sheet detent mapping with fractional heights", () => {
    expect(kt).toContain('"small" -> 0.25f');
    expect(kt).toContain('"medium" -> 0.5f');
    expect(kt).toContain('"large" -> 0.75f');
    expect(kt).toContain('"full" -> 1.0f');
    expect(kt).toContain("fillMaxHeight(heightFraction)");
  });

  it("supports sheet dismissible property", () => {
    expect(kt).toContain('config["dismissible"] as? Boolean');
    expect(kt).toContain("confirmValueChange = { dismissible }");
  });

  it("supports sheet corner radius", () => {
    expect(kt).toContain('config["cornerRadius"] as? Number');
    expect(kt).toContain("RoundedCornerShape(topStart = cornerRadius.dp");
  });

  it("supports sheet background color", () => {
    expect(kt).toContain('parseTintColor(config["backgroundColor"]');
    expect(kt).toContain("containerColor = bgColor");
  });

  it("fires sheet lifecycle events", () => {
    expect(kt).toContain('"sheet.presented"');
    expect(kt).toContain('"sheet.dismissed"');
    expect(kt).toContain('"sheet.detentChanged"');
    expect(kt).toContain('chromeArea = "sheet"');
  });

  it("animates sheet close when presented becomes false", () => {
    expect(kt).toContain("sheetState.hide()");
    expect(kt).toContain("var showSheet by remember");
  });

  it("iterates all configured sheets, not just presented ones", () => {
    expect(kt).toContain("NativiteSheet(name.toString(), config, bridge)");
    expect(kt).not.toContain("if (presented) {\n                NativiteSheet(");
  });

  it("supports disabled bar items", () => {
    expect(kt).toContain('item["disabled"] as? Boolean');
  });

  it("supports badge on bar items", () => {
    expect(kt).toContain("BadgedBox");
    expect(kt).toContain("Badge {");
  });

  it("supports per-button tint color", () => {
    expect(kt).toContain('parseTintColor(item["tint"]');
  });

  it("shows text label when no icon", () => {
    expect(kt).toContain("TextButton(");
    expect(kt).toContain("Text(label, color = resolvedTint)");
  });

  it("supports dropdown menus on bar items", () => {
    expect(kt).toContain("fun NativiteDropdownMenu(");
    expect(kt).toContain("DropdownMenu(");
    expect(kt).toContain("DropdownMenuItem(");
  });

  it("fires menu item pressed events", () => {
    expect(kt).toContain('"titleBar.menuItemPressed"');
    expect(kt).toContain('"toolbar.menuItemPressed"');
  });

  it("passes full NCLP node IDs back to the bridge when available", () => {
    expect(kt).toContain('val nclpId = item["nclpId"] as? String ?: id');
    expect(kt).toContain('val itemNclpId = menuItem["nclpId"] as? String ?: itemId');
    expect(kt).toContain('"nclpId" to nclpId');
    expect(kt).toContain('"nclpId" to itemNclpId');
  });

  it("supports status bar control", () => {
    expect(kt).toContain("fun NativiteStatusBar(");
    expect(kt).toContain("WindowCompat.getInsetsController");
    expect(kt).toContain("isAppearanceLightStatusBars");
    expect(kt).toContain("WindowInsetsCompat.Type.statusBars()");
    expect(kt).toContain("isSystemInDarkTheme()");
  });

  it("supports home indicator (system nav bar) control", () => {
    expect(kt).toContain("fun NativiteHomeIndicator(");
    expect(kt).toContain("WindowInsetsCompat.Type.navigationBars()");
    expect(kt).toContain("BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE");
  });

  it("supports drawer rendering", () => {
    expect(kt).toContain("fun NativiteDrawers(");
    expect(kt).toContain("ModalNavigationDrawer(");
    expect(kt).toContain("ModalDrawerSheet(");
  });

  it("fires drawer lifecycle events via state observation", () => {
    expect(kt).toContain('"drawer.presented"');
    expect(kt).toContain('"drawer.dismissed"');
    expect(kt).toContain("LaunchedEffect(drawerState.currentValue)");
  });

  it("retains drawer config during close animation", () => {
    expect(kt).toContain("lastDrawerName");
    expect(kt).toContain("lastDrawerConfig");
  });

  it("supports trailing drawer side via layout direction flip", () => {
    expect(kt).toContain('activeConfig["side"]');
    expect(kt).toContain("LocalLayoutDirection");
    expect(kt).toContain("LayoutDirection.Rtl");
  });

  it("supports keyboard accessory", () => {
    expect(kt).toContain("fun NativiteKeyboardAccessory(");
    expect(kt).toContain("WindowInsets.ime");
    expect(kt).toContain("AnimatedVisibility(");
    expect(kt).toContain('"keyboard.itemPressed"');
  });

  it("supports popovers", () => {
    expect(kt).toContain("fun NativitePopover(");
    expect(kt).toContain("Popup(");
    expect(kt).toContain('"popover.presented"');
    expect(kt).toContain('"popover.dismissed"');
  });

  it("supports tab bottom accessory", () => {
    expect(kt).toContain("fun NativiteTabBottomAccessory(");
    expect(kt).toContain('"tabBottomAccessory.presented"');
    expect(kt).toContain('"tabBottomAccessory.dismissed"');
    expect(kt).toContain('chromeArea = "tabBottomAccessory"');
  });

  it("sends events with item IDs for navigation", () => {
    expect(kt).toContain('"navigation.itemPressed"');
    expect(kt).toContain('"titleBar.leadingItemPressed"');
    expect(kt).toContain('"titleBar.trailingItemPressed"');
    expect(kt).toContain('"toolbar.itemPressed"');
  });

  it("handles back button via BackHandler", () => {
    expect(kt).toContain("BackHandler");
    expect(kt).toContain("navigation.backPressed");
  });

  it("resolves Material Icons via static when expression, not reflection", () => {
    expect(kt).toContain("fun materialIcon(");
    expect(kt).not.toContain("javaClass.methods");
    expect(kt).toContain("when (name)");
  });

  it("maps common Material Icon names to direct icon references", () => {
    expect(kt).toContain('"Home" -> Icons.Default.Home');
    expect(kt).toContain('"Settings" -> Icons.Default.Settings');
    expect(kt).toContain('"Search" -> Icons.Default.Search');
    expect(kt).toContain('"Share" -> Icons.Default.Share');
    expect(kt).toContain('"Add" -> Icons.Default.Add');
    expect(kt).toContain('"Delete" -> Icons.Default.Delete');
    expect(kt).toContain('"Edit" -> Icons.Default.Edit');
    expect(kt).toContain('"Close" -> Icons.Default.Close');
    expect(kt).toContain('"Check" -> Icons.Default.Check');
    expect(kt).toContain('"Person" -> Icons.Default.Person');
    expect(kt).toContain('"Notifications" -> Icons.Default.Notifications');
    expect(kt).toContain('"Favorite" -> Icons.Default.Favorite');
  });

  it("maps AutoMirrored icons for RTL support", () => {
    expect(kt).toContain('"ArrowBack" -> Icons.AutoMirrored.Filled.ArrowBack');
    expect(kt).toContain('"ArrowForward" -> Icons.AutoMirrored.Filled.ArrowForward');
    expect(kt).toContain('"Send" -> Icons.AutoMirrored.Filled.Send');
    expect(kt).toContain('"ExitToApp" -> Icons.AutoMirrored.Filled.ExitToApp');
    expect(kt).toContain('"List" -> Icons.AutoMirrored.Filled.List');
  });

  it("falls back to Star icon for unknown names", () => {
    expect(kt).toContain("else -> Icons.Default.Star");
  });

  it("includes parseTintColor helper", () => {
    expect(kt).toContain("fun parseTintColor(hex: String?): Color?");
    expect(kt).toContain("trimStart('#')");
    expect(kt).toContain("toLongOrNull(16)");
  });

  it("reads all chrome state areas in NativiteApp", () => {
    expect(kt).toContain('chromeState["titleBar"]');
    expect(kt).toContain('chromeState["navigation"]');
    expect(kt).toContain('chromeState["toolbar"]');
    expect(kt).toContain('chromeState["sheets"]');
    expect(kt).toContain('chromeState["drawers"]');
    expect(kt).toContain('chromeState["statusBar"]');
    expect(kt).toContain('chromeState["homeIndicator"]');
    expect(kt).toContain('chromeState["keyboard"]');
    expect(kt).toContain('chromeState["popovers"]');
    expect(kt).toContain('chromeState["tabBottomAccessory"]');
  });
});
