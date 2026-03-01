import type { NativiteConfig } from "../../index.ts";

export function nativiteChromeTemplate(config: NativiteConfig): string {
  const pkg = config.app.bundleId;

  return `package ${pkg}

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp

// ─── NativiteApp ────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativiteApp(bridge: NativiteBridge) {
    val chromeState by bridge.chromeState

    val titleBar = chromeState["titleBar"] as? Map<*, *>
    val navigation = chromeState["navigation"] as? Map<*, *>
    val toolbar = chromeState["toolbar"] as? Map<*, *>
    val sheets = chromeState["sheets"] as? Map<*, *>

    val useLargeTitle = titleBar?.get("prefersLargeTitles") == true
    val scrollBehavior = if (useLargeTitle) {
        TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    } else {
        null
    }

    // Back button handler
    BackHandler {
        bridge.sendEventToPrimary("navigation.backPressed", null)
    }

    Scaffold(
        modifier = if (scrollBehavior != null) {
            Modifier.nestedScroll(scrollBehavior.nestedScrollConnection)
        } else {
            Modifier
        },
        topBar = {
            if (titleBar != null) {
                NativiteTitleBar(titleBar, bridge, useLargeTitle, scrollBehavior)
            }
        },
        bottomBar = {
            if (navigation != null) {
                NativiteNavigationBar(navigation, bridge)
            } else if (toolbar != null) {
                NativiteToolbar(toolbar, bridge)
            }
        },
    ) { padding ->
        NativiteWebView(
            bridge = bridge,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        )
    }

    // Sheets
    if (sheets != null) {
        for ((name, sheetConfig) in sheets) {
            val config = sheetConfig as? Map<*, *> ?: continue
            val presented = config["presented"] == true
            if (presented) {
                NativiteSheet(name.toString(), config, bridge)
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
    val leadingItems = extractItems(config["leadingItems"])
    val trailingItems = extractItems(config["trailingItems"])

    if (useLargeTitle) {
        LargeTopAppBar(
            title = { Text(title) },
            navigationIcon = {
                for (item in leadingItems) {
                    BarItemButton(item, bridge, "titleBar.leadingItemPressed")
                }
            },
            actions = {
                for (item in trailingItems) {
                    BarItemButton(item, bridge, "titleBar.trailingItemPressed")
                }
            },
            scrollBehavior = scrollBehavior,
        )
    } else {
        TopAppBar(
            title = { Text(title) },
            navigationIcon = {
                for (item in leadingItems) {
                    BarItemButton(item, bridge, "titleBar.leadingItemPressed")
                }
            },
            actions = {
                for (item in trailingItems) {
                    BarItemButton(item, bridge, "titleBar.trailingItemPressed")
                }
            },
        )
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
            val title = item["title"] as? String ?: ""
            val icon = item["icon"] as? String
            val badge = item["badge"] as? String
            val selected = id == activeItem

            NavigationBarItem(
                selected = selected,
                onClick = {
                    bridge.sendEventToPrimary("navigation.itemPressed", mapOf("id" to id))
                },
                icon = {
                    val imageVector = sfSymbolToMaterialIcon(icon)
                    if (badge != null) {
                        BadgedBox(badge = { Badge { Text(badge) } }) {
                            Icon(imageVector, contentDescription = title)
                        }
                    } else {
                        Icon(imageVector, contentDescription = title)
                    }
                },
                label = { Text(title) },
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
    val grabberVisible = config["grabberVisible"] == true
    val detents = config["detents"] as? List<*>

    val skipPartiallyExpanded = detents?.size == 1 && detents.first() == "large"
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = skipPartiallyExpanded,
    )

    ModalBottomSheet(
        onDismissRequest = {
            bridge.sendEventToPrimary("sheet.dismissed", mapOf("name" to name))
        },
        sheetState = sheetState,
        dragHandle = if (grabberVisible) {
            { androidx.compose.material3.BottomSheetDefaults.DragHandle() }
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
                .height(400.dp),
        )
    }
}

// ─── BarItem helpers ────────────────────────────────────────────────────────

@Composable
fun BarItemButton(item: Map<*, *>, bridge: NativiteBridge, eventName: String) {
    val id = item["id"] as? String ?: return
    val title = item["title"] as? String ?: ""
    val icon = item["icon"] as? String
    val style = item["style"] as? String

    val tint = when (style) {
        "destructive" -> MaterialTheme.colorScheme.error
        "primary" -> MaterialTheme.colorScheme.primary
        else -> Color.Unspecified
    }

    IconButton(onClick = {
        bridge.sendEventToPrimary(eventName, mapOf("id" to id))
    }) {
        Icon(
            imageVector = sfSymbolToMaterialIcon(icon),
            contentDescription = title,
            tint = if (tint != Color.Unspecified) tint else MaterialTheme.colorScheme.onSurface,
        )
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

// ─── SF Symbol to Material Icon mapping ─────────────────────────────────────

private fun sfSymbolToMaterialIcon(name: String?): ImageVector {
    if (name == null) return Icons.Default.Star
    return when (name) {
        "plus", "plus.circle", "plus.circle.fill" -> Icons.Default.Add
        "xmark", "xmark.circle", "xmark.circle.fill" -> Icons.Default.Close
        "trash", "trash.fill", "trash.circle" -> Icons.Default.Delete
        "pencil", "square.and.pencil" -> Icons.Default.Edit
        "heart", "heart.fill" -> Icons.Default.Favorite
        "house", "house.fill" -> Icons.Default.Home
        "info.circle", "info.circle.fill" -> Icons.Default.Info
        "line.3.horizontal" -> Icons.Default.Menu
        "ellipsis", "ellipsis.circle" -> Icons.Default.MoreVert
        "person", "person.fill", "person.circle" -> Icons.Default.Person
        "arrow.clockwise" -> Icons.Default.Refresh
        "magnifyingglass" -> Icons.Default.Search
        "gearshape", "gearshape.fill", "gear" -> Icons.Default.Settings
        "square.and.arrow.up" -> Icons.Default.Share
        "star", "star.fill" -> Icons.Default.Star
        "chevron.left", "arrow.left" -> Icons.AutoMirrored.Filled.ArrowBack
        else -> Icons.Default.Star
    }
}

private fun mapOf(vararg pairs: Pair<String, Any?>): Map<String, Any?> {
    return pairs.toMap()
}
`;
}
