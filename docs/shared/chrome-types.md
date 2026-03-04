# Chrome Type Definitions

> Maps to: `src/chrome/types.ts`

All type definitions for the Chrome API, shared across all platforms.

## Item Types

### ButtonItem

```typescript
interface ButtonItem {
  readonly id: string;
  readonly label?: string;
  readonly icon?: string; // SF Symbol (iOS/macOS) or Material Icon (Android)
  readonly style?: "plain" | "primary" | "destructive";
  readonly disabled?: boolean;
  readonly tint?: string; // Hex colour override
  readonly badge?: string | number | null;
  readonly menu?: MenuConfig; // Dropdown menu
  readonly customization?: "default" | "hidden" | "required"; // macOS toolbar only
}
```

### BarItem

```typescript
type BarItem = ButtonItem | FlexibleSpace | FixedSpace;
```

Where:

- `FlexibleSpace` = `"flexible-space"` — Expands to fill available width
- `FixedSpace` = `"fixed-space"` — Fixed-width spacer

### NavigationItem

```typescript
interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string; // Required (SF Symbol / Material Icon)
  readonly subtitle?: string; // iOS 18+
  readonly badge?: string | number | null;
  readonly disabled?: boolean;
  readonly role?: "search"; // Creates UISearchTab on iOS 18+
}
```

### SidebarItem

```typescript
interface SidebarItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly badge?: string | number | null;
  readonly children?: readonly SidebarItem[]; // Nested groups
}
```

### MenuConfig / MenuItem

```typescript
interface MenuConfig {
  readonly title?: string;
  readonly items: readonly MenuItem[];
}

interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly style?: "plain" | "destructive";
  readonly keyEquivalent?: string; // macOS only (e.g., "s" for Cmd+S)
  readonly children?: readonly MenuItem[]; // Nested submenus
}
```

## Chrome Area Configs

### TitleBarConfig

```typescript
interface TitleBarConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly largeTitleMode?: "large" | "inline" | "automatic";
  readonly backLabel?: string | null;
  readonly tint?: string;
  readonly leadingItems?: readonly BarItem[];
  readonly trailingItems?: readonly BarItem[];
  readonly searchBar?: SearchBarConfig;
  readonly hidden?: boolean;
  readonly fullSizeContent?: boolean; // macOS: content under title bar
  readonly separatorStyle?: "automatic" | "none" | "line" | "shadow";
}
```

### NavigationConfig

```typescript
interface NavigationConfig {
  readonly items: readonly NavigationItem[];
  readonly activeItem?: string;
  readonly style?: "tabs" | "sidebar" | "auto";
  readonly hidden?: boolean;
  readonly searchBar?: SearchBarConfig;
  readonly minimizeBehavior?: "automatic" | "never" | "onScrollDown" | "onScrollUp";
}
```

### ToolbarGroup

```typescript
interface ToolbarGroup {
  readonly placement:
    | "automatic"
    | "principal"
    | "secondaryAction"
    | "navigation"
    | "primaryAction";
  readonly items: readonly BarItem[];
}
```

### ToolbarConfig

```typescript
interface ToolbarConfig {
  readonly items?: readonly BarItem[];
  readonly groups?: readonly ToolbarGroup[];
  readonly hidden?: boolean;
  readonly customizable?: boolean; // macOS only
  readonly id?: string; // macOS only
  readonly displayMode?: "iconAndLabel" | "iconOnly" | "labelOnly"; // macOS only
  readonly toolbarStyle?: "unified" | "expanded"; // macOS only
}
```

### SidebarPanelConfig

```typescript
interface SidebarPanelConfig {
  readonly items: readonly SidebarItem[];
  readonly activeItem?: string;
  readonly title?: string;
  readonly visible?: boolean;
}
```

### StatusBarConfig

```typescript
interface StatusBarConfig {
  readonly style?: "light" | "dark" | "auto";
  readonly hidden?: boolean;
}
```

### HomeIndicatorConfig

```typescript
interface HomeIndicatorConfig {
  readonly hidden?: boolean;
}
```

### KeyboardConfig

```typescript
interface KeyboardConfig {
  readonly accessory?: {
    readonly items: readonly BarItem[];
  };
  readonly dismissMode?: "none" | "on-drag" | "interactive";
}
```

### MenuBarConfig (macOS)

```typescript
interface MenuBarConfig {
  readonly menus: readonly {
    readonly title: string;
    readonly items: readonly MenuItem[];
  }[];
}
```

### TabBottomAccessoryConfig

```typescript
interface TabBottomAccessoryConfig {
  readonly url: string;
}
```

## Child Webview Configs

All child webviews share a base:

```typescript
interface ChildWebviewBase {
  readonly url?: string;
  readonly presented?: boolean;
}
```

### SheetConfig

```typescript
interface SheetConfig extends ChildWebviewBase {
  readonly detents?: readonly ("small" | "medium" | "large" | "full")[];
  readonly activeDetent?: "small" | "medium" | "large" | "full";
  readonly grabberVisible?: boolean;
  readonly dismissible?: boolean;
  readonly cornerRadius?: number;
  readonly backgroundColor?: string;
}
```

### DrawerConfig

```typescript
interface DrawerConfig extends ChildWebviewBase {
  readonly side?: "leading" | "trailing";
  readonly width?: "small" | "medium" | "large" | number;
  readonly dismissible?: boolean;
  readonly backgroundColor?: string;
}
```

### AppWindowConfig (macOS)

```typescript
interface AppWindowConfig extends ChildWebviewBase {
  readonly title?: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly minSize?: { readonly width: number; readonly height: number };
  readonly resizable?: boolean;
  readonly modal?: boolean;
}
```

### PopoverConfig

```typescript
interface PopoverConfig extends ChildWebviewBase {
  readonly size?: { readonly width: number; readonly height: number };
  readonly anchorElementId?: string;
}
```

## ChromeState (Final Merged State)

```typescript
interface ChromeState {
  readonly titleBar?: TitleBarConfig;
  readonly navigation?: NavigationConfig;
  readonly sidebarPanel?: SidebarPanelConfig;
  readonly toolbar?: ToolbarConfig;
  readonly keyboard?: KeyboardConfig;
  readonly statusBar?: StatusBarConfig;
  readonly homeIndicator?: HomeIndicatorConfig;
  readonly menuBar?: MenuBarConfig;
  readonly tabBottomAccessory?: TabBottomAccessoryConfig;
  readonly sheets?: Readonly<Record<string, SheetConfig>>;
  readonly drawers?: Readonly<Record<string, DrawerConfig>>;
  readonly appWindows?: Readonly<Record<string, AppWindowConfig>>;
  readonly popovers?: Readonly<Record<string, PopoverConfig>>;
}
```

## ChromeEvent (Discriminated Union)

Full list of event types — see [Chrome API](./chrome-api.md) for the complete event reference.

```typescript
type ChromeEvent =
  | { readonly type: "titleBar.leadingItemPressed"; readonly id: string }
  | { readonly type: "titleBar.trailingItemPressed"; readonly id: string }
  | { readonly type: "navigation.itemPressed"; readonly id: string }
  | { readonly type: "sheet.presented"; readonly name: string }
  | { readonly type: "sheet.dismissed"; readonly name: string }
  | { readonly type: "message"; readonly from: "main" | (string & {}); readonly payload: unknown }
  | {
      readonly type: "safeArea.changed";
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
      readonly left: number;
    };
// ... 40+ total event types
```

## Icon Names

Icons are specified as strings and resolved per platform:

| Platform    | Icon System    | Example                                                            |
| ----------- | -------------- | ------------------------------------------------------------------ |
| iOS / macOS | SF Symbols     | `"house.fill"`, `"gear"`, `"square.and.arrow.up"`                  |
| Android     | Material Icons | `"Home"`, `"Settings"`, `"Share"` (reflected from `Icons.Default`) |
