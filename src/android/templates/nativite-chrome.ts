import type { NativiteConfig } from "../../index.ts";

export function nativiteChromeTemplate(config: NativiteConfig): string {
  const pkg = config.app.bundleId;

  return `package ${pkg}

import android.app.Activity
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.runtime.CompositionLocalProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

// ─── NativiteApp ────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativiteApp(bridge: NativiteBridge) {
    val chromeState by bridge.chromeState

    val titleBar = chromeState["titleBar"] as? Map<*, *>
    val navigation = chromeState["navigation"] as? Map<*, *>
    val toolbar = chromeState["toolbar"] as? Map<*, *>
    val sheets = chromeState["sheets"] as? Map<*, *>
    val drawers = chromeState["drawers"] as? Map<*, *>
    val statusBar = chromeState["statusBar"] as? Map<*, *>
    val homeIndicator = chromeState["homeIndicator"] as? Map<*, *>
    val keyboard = chromeState["keyboard"] as? Map<*, *>
    val popovers = chromeState["popovers"] as? Map<*, *>
    val tabBottomAccessory = chromeState["tabBottomAccessory"] as? Map<*, *>

    val largeTitleMode = titleBar?.get("largeTitleMode") as? String ?: "inline"
    val useLargeTitle = largeTitleMode == "large" || largeTitleMode == "automatic"
    val scrollBehavior = if (useLargeTitle) {
        TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    } else {
        null
    }

    // Back button handler
    BackHandler {
        bridge.sendEventToPrimary("navigation.backPressed", null)
    }

    // Status bar side effects
    NativiteStatusBar(statusBar)

    // Home indicator (system nav bar) side effects
    NativiteHomeIndicator(homeIndicator)

    // Drawer wrapper
    NativiteDrawers(drawers, bridge) {
        Scaffold(
            modifier = if (scrollBehavior != null) {
                Modifier.nestedScroll(scrollBehavior.nestedScrollConnection)
            } else {
                Modifier
            },
            topBar = {
                if (titleBar != null && titleBar["hidden"] != true) {
                    NativiteTitleBar(titleBar, bridge, useLargeTitle, scrollBehavior)
                }
            },
            bottomBar = {
                Column {
                    // Tab bottom accessory docked above the nav/toolbar
                    if (tabBottomAccessory != null && tabBottomAccessory["presented"] == true) {
                        NativiteTabBottomAccessory(tabBottomAccessory, bridge)
                    }
                    if (navigation != null && navigation["hidden"] != true) {
                        NativiteNavigationBar(navigation, bridge)
                    } else if (toolbar != null && toolbar["hidden"] != true) {
                        NativiteToolbar(toolbar, bridge)
                    }
                }
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                NativiteWebView(
                    bridge = bridge,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
                // Keyboard accessory
                NativiteKeyboardAccessory(keyboard, bridge)
            }
        }
    }

    // Sheets — iterate all configured sheets so each can manage its own
    // show/hide lifecycle (allowing close animations to complete).
    if (sheets != null) {
        for ((name, sheetConfig) in sheets) {
            val config = sheetConfig as? Map<*, *> ?: continue
            NativiteSheet(name.toString(), config, bridge)
        }
    }

    // Popovers
    if (popovers != null) {
        for ((name, popoverConfig) in popovers) {
            val config = popoverConfig as? Map<*, *> ?: continue
            val presented = config["presented"] == true
            if (presented) {
                NativitePopover(name.toString(), config, bridge)
            }
        }
    }
}

// ─── TitleBar ───────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativiteTitleBar(
    config: Map<*, *>,
    bridge: NativiteBridge,
    useLargeTitle: Boolean,
    scrollBehavior: androidx.compose.material3.TopAppBarScrollBehavior?,
) {
    val title = config["title"] as? String ?: ""
    val subtitle = config["subtitle"] as? String
    val leadingItems = extractItems(config["leadingItems"])
    val trailingItems = extractItems(config["trailingItems"])
    val tintColor = parseTintColor(config["tint"] as? String)
    val searchBar = config["searchBar"] as? Map<*, *>

    val titleContent: @Composable () -> Unit = {
        if (subtitle != null) {
            Column {
                Text(title)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            Text(title)
        }
    }

    val navigationIcon: @Composable () -> Unit = {
        if (leadingItems.isNotEmpty()) {
            for (item in leadingItems) {
                BarItemButton(item, bridge, "titleBar.leadingItemPressed")
            }
        }
    }

    val actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {
        for (item in trailingItems) {
            BarItemButton(item, bridge, "titleBar.trailingItemPressed")
        }
    }

    val colors = if (tintColor != null) {
        if (useLargeTitle) {
            TopAppBarDefaults.largeTopAppBarColors(
                actionIconContentColor = tintColor,
                navigationIconContentColor = tintColor,
            )
        } else {
            TopAppBarDefaults.topAppBarColors(
                actionIconContentColor = tintColor,
                navigationIconContentColor = tintColor,
            )
        }
    } else {
        null
    }

    Column {
        if (useLargeTitle) {
            if (colors != null) {
                LargeTopAppBar(
                    title = titleContent,
                    navigationIcon = navigationIcon,
                    actions = actions,
                    scrollBehavior = scrollBehavior,
                    colors = colors,
                )
            } else {
                LargeTopAppBar(
                    title = titleContent,
                    navigationIcon = navigationIcon,
                    actions = actions,
                    scrollBehavior = scrollBehavior,
                )
            }
        } else {
            if (colors != null) {
                TopAppBar(
                    title = titleContent,
                    navigationIcon = navigationIcon,
                    actions = actions,
                    colors = colors,
                )
            } else {
                TopAppBar(
                    title = titleContent,
                    navigationIcon = navigationIcon,
                    actions = actions,
                )
            }
        }

        // Search bar below the title bar
        if (searchBar != null) {
            NativiteTitleBarSearch(searchBar, bridge)
        }
    }
}

@Composable
fun NativiteTitleBarSearch(config: Map<*, *>, bridge: NativiteBridge) {
    val placeholder = config["placeholder"] as? String ?: "Search"
    val initialValue = config["value"] as? String ?: ""
    var query by remember { mutableStateOf(initialValue) }

    // Sync external value changes
    LaunchedEffect(initialValue) {
        query = initialValue
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.width(8.dp))
            androidx.compose.foundation.text.BasicTextField(
                value = query,
                onValueChange = { newValue ->
                    query = newValue
                    bridge.sendEventToPrimary(
                        "titleBar.searchChanged",
                        mapOf("value" to newValue),
                    )
                },
                modifier = Modifier.weight(1f),
                singleLine = true,
                decorationBox = { innerTextField ->
                    Box {
                        if (query.isEmpty()) {
                            Text(
                                placeholder,
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        innerTextField()
                    }
                },
            )
            if (query.isNotEmpty()) {
                IconButton(onClick = {
                    query = ""
                    bridge.sendEventToPrimary("titleBar.searchCancelled", null)
                }) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Clear",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

// ─── NavigationBar ──────────────────────────────────────────────────────────

@Composable
fun NativiteNavigationBar(config: Map<*, *>, bridge: NativiteBridge) {
    val items = extractNavItems(config["items"])
    val activeItem = config["activeItem"] as? String

    if (items.isEmpty()) return

    NavigationBar {
        for (item in items) {
            val id = item["id"] as? String ?: continue
            val label = item["label"] as? String ?: ""
            val icon = item["icon"] as? String
            val badge = item["badge"]?.toString()
            val subtitle = item["subtitle"] as? String
            val disabled = item["disabled"] as? Boolean ?: false
            val selected = id == activeItem

            NavigationBarItem(
                selected = selected,
                enabled = !disabled,
                onClick = {
                    bridge.sendEventToPrimary("navigation.itemPressed", mapOf("id" to id))
                },
                icon = {
                    val imageVector = materialIcon(icon)
                    if (badge != null) {
                        BadgedBox(badge = { Badge { Text(badge) } }) {
                            Icon(imageVector, contentDescription = label)
                        }
                    } else {
                        Icon(imageVector, contentDescription = label)
                    }
                },
                label = {
                    if (subtitle != null) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(label)
                            Text(
                                subtitle,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        Text(label)
                    }
                },
            )
        }
    }
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

@Composable
fun NativiteToolbar(config: Map<*, *>, bridge: NativiteBridge) {
    val items = extractItems(config["items"])
    if (items.isEmpty()) return

    BottomAppBar {
        Row(modifier = Modifier.fillMaxWidth()) {
            for (item in items) {
                val type = item["type"] as? String
                when (type) {
                    "flexible-space" -> Spacer(modifier = Modifier.weight(1f))
                    "fixed-space" -> {
                        val width = (item["width"] as? Number)?.toDouble() ?: 16.0
                        Spacer(modifier = Modifier.width(width.dp))
                    }
                    else -> BarItemButton(item, bridge, "toolbar.itemPressed")
                }
            }
        }
    }
}

// ─── Sheet ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativiteSheet(name: String, config: Map<*, *>, bridge: NativiteBridge) {
    val url = config["url"] as? String ?: return
    val presented = config["presented"] == true
    val grabberVisible = config["grabberVisible"] == true
    val detents = (config["detents"] as? List<*>)?.filterIsInstance<String>() ?: listOf("medium", "large")
    val activeDetent = config["activeDetent"] as? String
    val dismissible = config["dismissible"] as? Boolean ?: true
    val cornerRadius = (config["cornerRadius"] as? Number)?.toFloat()
    val bgColor = parseTintColor(config["backgroundColor"] as? String)

    val skipPartiallyExpanded = detents.size == 1 && (detents[0] == "large" || detents[0] == "full")
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = skipPartiallyExpanded,
        confirmValueChange = { dismissible },
    )

    // Track whether the ModalBottomSheet composable is in the tree.
    // This stays true while the close animation plays so the sheet
    // isn't ripped out of composition mid-transition.
    var showSheet by remember { mutableStateOf(false) }

    // Drive visibility from the presented flag.
    LaunchedEffect(presented) {
        if (presented) {
            showSheet = true
        } else if (showSheet) {
            // Animate the sheet closed, then remove it from the tree.
            sheetState.hide()
            showSheet = false
        }
    }

    if (!showSheet) return

    val shape = if (cornerRadius != null) {
        RoundedCornerShape(topStart = cornerRadius.dp, topEnd = cornerRadius.dp)
    } else {
        BottomSheetDefaults.ExpandedShape
    }

    // Determine height fraction from active detent or largest available
    val targetDetent = activeDetent ?: detents.lastOrNull() ?: "medium"
    val heightFraction = when (targetDetent) {
        "small" -> 0.25f
        "medium" -> 0.5f
        "large" -> 0.75f
        "full" -> 1.0f
        else -> 0.5f
    }

    // Fire presented event
    LaunchedEffect(name) {
        bridge.sendEventToPrimary("sheet.presented", mapOf("name" to name))
    }

    // Observe detent changes
    LaunchedEffect(sheetState.currentValue) {
        val detentName = when (sheetState.currentValue) {
            SheetValue.Hidden -> return@LaunchedEffect
            SheetValue.PartiallyExpanded -> "medium"
            SheetValue.Expanded -> if (skipPartiallyExpanded) detents.firstOrNull() ?: "large" else "large"
        }
        bridge.sendEventToPrimary("sheet.detentChanged", mapOf("name" to name, "detent" to detentName))
    }

    ModalBottomSheet(
        onDismissRequest = {
            showSheet = false
            bridge.sendEventToPrimary("sheet.dismissed", mapOf("name" to name))
        },
        sheetState = sheetState,
        shape = shape,
        containerColor = bgColor ?: MaterialTheme.colorScheme.surface,
        dragHandle = if (grabberVisible) {
            { BottomSheetDefaults.DragHandle() }
        } else {
            null
        },
    ) {
        NativiteWebView(
            bridge = bridge,
            instanceName = name,
            url = url,
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(heightFraction),
        )
    }
}

// ─── Drawer ─────────────────────────────────────────────────────────────────

@Composable
fun NativiteDrawers(
    drawers: Map<*, *>?,
    bridge: NativiteBridge,
    content: @Composable () -> Unit,
) {
    val presentedEntry = drawers?.entries?.firstOrNull { (_, config) ->
        (config as? Map<*, *>)?.get("presented") == true
    }
    val isPresented = presentedEntry != null

    // Retain the last drawer config so the content remains visible during the
    // close animation even after JS sets presented: false.
    var lastDrawerName by remember { mutableStateOf<String?>(null) }
    var lastDrawerConfig by remember { mutableStateOf<Map<*, *>?>(null) }

    if (presentedEntry != null) {
        lastDrawerName = presentedEntry.key.toString()
        lastDrawerConfig = presentedEntry.value as? Map<*, *>
    }

    val activeName = lastDrawerName
    val activeConfig = lastDrawerConfig

    if (activeName == null || activeConfig == null) {
        content()
        return
    }

    val url = activeConfig["url"] as? String ?: ""
    val dismissible = activeConfig["dismissible"] as? Boolean ?: true
    val bgColor = parseTintColor(activeConfig["backgroundColor"] as? String)
    val side = activeConfig["side"] as? String ?: "leading"
    val widthConfig = activeConfig["width"]
    val drawerWidth = when (widthConfig) {
        "small" -> 240.dp
        "medium" -> 300.dp
        "large" -> 360.dp
        is Number -> widthConfig.toInt().dp
        else -> 300.dp
    }

    val drawerState = rememberDrawerState(DrawerValue.Closed)
    var hasOpened by remember { mutableStateOf(false) }

    // Drive the drawer open/closed based on the presented flag.
    LaunchedEffect(isPresented) {
        if (isPresented) {
            drawerState.open()
        } else {
            drawerState.close()
        }
    }

    // Fire lifecycle events once the drawer settles.
    LaunchedEffect(drawerState.currentValue) {
        when (drawerState.currentValue) {
            DrawerValue.Open -> {
                hasOpened = true
                bridge.sendEventToPrimary("drawer.presented", mapOf("name" to activeName))
            }
            DrawerValue.Closed -> {
                if (hasOpened) {
                    bridge.sendEventToPrimary("drawer.dismissed", mapOf("name" to activeName))
                    hasOpened = false
                    lastDrawerName = null
                    lastDrawerConfig = null
                }
            }
        }
    }

    // ModalNavigationDrawer always opens on the start side. To support
    // trailing drawers, flip the layout direction around the drawer and
    // restore the original direction inside both the drawer sheet and content.
    val isTrailing = side == "trailing"
    val currentDirection = LocalLayoutDirection.current
    val drawerDirection = if (isTrailing) {
        if (currentDirection == LayoutDirection.Ltr) LayoutDirection.Rtl else LayoutDirection.Ltr
    } else {
        currentDirection
    }

    CompositionLocalProvider(LocalLayoutDirection provides drawerDirection) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            gesturesEnabled = dismissible,
            drawerContent = {
                CompositionLocalProvider(LocalLayoutDirection provides currentDirection) {
                    ModalDrawerSheet(
                        modifier = Modifier.width(drawerWidth),
                        drawerContainerColor = bgColor ?: MaterialTheme.colorScheme.surface,
                    ) {
                        NativiteWebView(
                            bridge = bridge,
                            instanceName = activeName,
                            url = url,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            },
        ) {
            CompositionLocalProvider(LocalLayoutDirection provides currentDirection) {
                content()
            }
        }
    }
}

// ─── Status Bar ─────────────────────────────────────────────────────────────

@Composable
fun NativiteStatusBar(config: Map<*, *>?) {
    if (config == null) return
    val style = config["style"] as? String ?: "auto"
    val hidden = config["hidden"] as? Boolean ?: false

    val activity = LocalContext.current as? ComponentActivity ?: return
    val window = activity.window
    val controller = WindowCompat.getInsetsController(window, window.decorView)

    LaunchedEffect(style, hidden) {
        if (hidden) {
            controller.hide(WindowInsetsCompat.Type.statusBars())
        } else {
            controller.show(WindowInsetsCompat.Type.statusBars())
        }

        controller.isAppearanceLightStatusBars = when (style) {
            "dark" -> true   // dark icons on light background
            "light" -> false // light icons on dark background
            else -> true     // auto — follow system
        }
    }
}

// ─── Home Indicator (System Navigation Bar) ─────────────────────────────────

@Composable
fun NativiteHomeIndicator(config: Map<*, *>?) {
    if (config == null) return
    val hidden = config["hidden"] as? Boolean ?: false

    val activity = LocalContext.current as? ComponentActivity ?: return
    val window = activity.window
    val controller = WindowCompat.getInsetsController(window, window.decorView)

    LaunchedEffect(hidden) {
        if (hidden) {
            controller.hide(WindowInsetsCompat.Type.navigationBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            controller.show(WindowInsetsCompat.Type.navigationBars())
        }
    }
}

// ─── Keyboard Accessory ─────────────────────────────────────────────────────

@Composable
fun NativiteKeyboardAccessory(config: Map<*, *>?, bridge: NativiteBridge) {
    if (config == null) return
    val accessory = config["accessory"] as? Map<*, *> ?: return
    val items = extractItems(accessory["items"])
    if (items.isEmpty()) return

    val density = LocalDensity.current
    val imeBottom = WindowInsets.ime.getBottom(density)
    val isKeyboardVisible = imeBottom > 0

    AnimatedVisibility(visible = isKeyboardVisible) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            tonalElevation = 3.dp,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                for (item in items) {
                    val type = item["type"] as? String
                    when (type) {
                        "flexible-space" -> Spacer(modifier = Modifier.weight(1f))
                        "fixed-space" -> {
                            val width = (item["width"] as? Number)?.toDouble() ?: 8.0
                            Spacer(modifier = Modifier.width(width.dp))
                        }
                        else -> BarItemButton(item, bridge, "keyboard.itemPressed")
                    }
                }
            }
        }
    }
}

// ─── Tab Bottom Accessory ───────────────────────────────────────────────────

@Composable
fun NativiteTabBottomAccessory(config: Map<*, *>, bridge: NativiteBridge) {
    val url = config["url"] as? String ?: return
    val bgColor = parseTintColor(config["backgroundColor"] as? String)

    LaunchedEffect(Unit) {
        bridge.sendEventToPrimary("tabBottomAccessory.presented", null)
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp),
        color = bgColor ?: MaterialTheme.colorScheme.surfaceContainer,
    ) {
        NativiteWebView(
            bridge = bridge,
            instanceName = "tabBottomAccessory",
            url = url,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

// ─── Popover ────────────────────────────────────────────────────────────────

@Composable
fun NativitePopover(name: String, config: Map<*, *>, bridge: NativiteBridge) {
    val url = config["url"] as? String ?: return
    val sizeConfig = config["size"] as? Map<*, *>
    val width = (sizeConfig?.get("width") as? Number)?.toInt() ?: 320
    val height = (sizeConfig?.get("height") as? Number)?.toInt() ?: 480

    LaunchedEffect(name) {
        bridge.sendEventToPrimary("popover.presented", mapOf("name" to name))
    }

    Popup(
        alignment = Alignment.Center,
        onDismissRequest = {
            bridge.sendEventToPrimary("popover.dismissed", mapOf("name" to name))
        },
    ) {
        Surface(
            modifier = Modifier.size(width.dp, height.dp),
            shape = RoundedCornerShape(12.dp),
            shadowElevation = 8.dp,
        ) {
            NativiteWebView(
                bridge = bridge,
                instanceName = name,
                url = url,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

// ─── BarItem helpers ────────────────────────────────────────────────────────

@Composable
fun BarItemButton(item: Map<*, *>, bridge: NativiteBridge, eventName: String) {
    val id = item["id"] as? String ?: return
    val label = item["label"] as? String ?: ""
    val icon = item["icon"] as? String
    val style = item["style"] as? String
    val disabled = item["disabled"] as? Boolean ?: false
    val badge = item["badge"]?.toString()
    val customTint = parseTintColor(item["tint"] as? String)
    val menu = item["menu"] as? Map<*, *>

    val tint = customTint ?: when (style) {
        "destructive" -> MaterialTheme.colorScheme.error
        "primary" -> MaterialTheme.colorScheme.primary
        else -> Color.Unspecified
    }
    val resolvedTint = if (tint != Color.Unspecified) tint else MaterialTheme.colorScheme.onSurface

    var menuExpanded by remember { mutableStateOf(false) }

    // Determine the menu event name based on the area
    val menuEventName = when {
        eventName.startsWith("titleBar.") -> "titleBar.menuItemPressed"
        eventName.startsWith("toolbar.") -> "toolbar.menuItemPressed"
        else -> eventName
    }

    Box {
        if (icon != null) {
            IconButton(
                onClick = {
                    if (menu != null) {
                        menuExpanded = true
                    } else {
                        bridge.sendEventToPrimary(eventName, mapOf("id" to id))
                    }
                },
                enabled = !disabled,
            ) {
                val imageVector = materialIcon(icon)
                if (badge != null) {
                    BadgedBox(badge = { Badge { Text(badge) } }) {
                        Icon(imageVector, contentDescription = label, tint = resolvedTint)
                    }
                } else {
                    Icon(imageVector, contentDescription = label, tint = resolvedTint)
                }
            }
        } else {
            // No icon — show text label
            TextButton(
                onClick = {
                    if (menu != null) {
                        menuExpanded = true
                    } else {
                        bridge.sendEventToPrimary(eventName, mapOf("id" to id))
                    }
                },
                enabled = !disabled,
            ) {
                Text(label, color = resolvedTint)
            }
        }

        // Dropdown menu
        if (menu != null) {
            NativiteDropdownMenu(
                menu = menu,
                expanded = menuExpanded,
                onDismiss = { menuExpanded = false },
                bridge = bridge,
                menuEventName = menuEventName,
            )
        }
    }
}

@Composable
fun NativiteDropdownMenu(
    menu: Map<*, *>,
    expanded: Boolean,
    onDismiss: () -> Unit,
    bridge: NativiteBridge,
    menuEventName: String,
) {
    val items = extractItems(menu["items"])
    val title = menu["title"] as? String

    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        if (title != null) {
            Text(
                title,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        for (menuItem in items) {
            val itemId = menuItem["id"] as? String ?: continue
            val itemLabel = menuItem["label"] as? String ?: continue
            val itemIcon = menuItem["icon"] as? String
            val itemDisabled = menuItem["disabled"] as? Boolean ?: false
            val itemStyle = menuItem["style"] as? String
            val itemChecked = menuItem["checked"] as? Boolean ?: false

            DropdownMenuItem(
                text = {
                    Text(
                        itemLabel,
                        color = if (itemStyle == "destructive") {
                            MaterialTheme.colorScheme.error
                        } else {
                            Color.Unspecified
                        },
                    )
                },
                onClick = {
                    bridge.sendEventToPrimary(menuEventName, mapOf("id" to itemId))
                    onDismiss()
                },
                enabled = !itemDisabled,
                leadingIcon = if (itemIcon != null) {
                    { Icon(materialIcon(itemIcon), contentDescription = null) }
                } else if (itemChecked) {
                    { Icon(Icons.Default.Check, contentDescription = null) }
                } else {
                    null
                },
                trailingIcon = if (itemChecked && itemIcon != null) {
                    { Icon(Icons.Default.Check, contentDescription = null) }
                } else {
                    null
                },
            )
        }
    }
}

// ─── Data extraction helpers ────────────────────────────────────────────────

private fun extractItems(raw: Any?): List<Map<*, *>> {
    val list = raw as? List<*> ?: return emptyList()
    return list.filterIsInstance<Map<*, *>>()
}

private fun extractNavItems(raw: Any?): List<Map<*, *>> {
    return extractItems(raw)
}

// ─── Color parsing ──────────────────────────────────────────────────────────

private fun parseTintColor(hex: String?): Color? {
    if (hex == null) return null
    val cleaned = hex.trimStart('#')
    val value = cleaned.toLongOrNull(16) ?: return null
    return if (cleaned.length == 6) {
        Color(0xFF000000 or value)
    } else if (cleaned.length == 8) {
        Color(value)
    } else {
        null
    }
}

// ─── Material Icon lookup ───────────────────────────────────────────────────

private val iconCache = mutableMapOf<String, ImageVector>()

private fun materialIcon(name: String?): ImageVector {
    if (name == null) return Icons.Default.Star
    iconCache[name]?.let { return it }

    val sources = arrayOf(Icons.Default, Icons.AutoMirrored.Filled)
    for (source in sources) {
        try {
            val getter = source.javaClass.methods.firstOrNull {
                it.name == "get\$name" && it.parameterCount == 0
            }
            val icon = getter?.invoke(source) as? ImageVector
            if (icon != null) {
                iconCache[name] = icon
                return icon
            }
        } catch (_: Exception) {}
    }
    return Icons.Default.Star
}

private fun mapOf(vararg pairs: Pair<String, Any?>): Map<String, Any?> {
    return pairs.toMap()
}
`;
}
