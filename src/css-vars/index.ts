/// <reference lib="dom" />

// ─── NKVars — typed helpers for the --nk-* CSS variable system ───────────────
//
// Variables are set on document.documentElement by NativiteVars.swift via
// window.__nk_patch(). When running in a browser (non-native) they are read
// from the :root <style> block injected by the WKUserScript at document start,
// or fall back to their specified defaults.
//
// Usage:
//   import { NKVars } from 'nativite/css-vars'
//
//   const kbHeight = NKVars.get('keyboard-height')   // → "0px" | "336px" etc.
//   const unsub = NKVars.observe('is-dark', (v) => {
//     document.body.classList.toggle('dark', v === '1')
//   })
//   unsub() // stop observing

// ─── Variable name map ────────────────────────────────────────────────────────

export type NKVarName =
  // Safe areas
  | "safe-top"
  | "safe-bottom"
  | "safe-left"
  | "safe-right"
  // Chrome geometry
  | "nav-height"
  | "nav-visible"
  | "tab-height"
  | "tab-visible"
  | "toolbar-height"
  | "toolbar-visible"
  | "status-height"
  // Combined insets
  | "inset-top"
  | "inset-bottom"
  | "inset-left"
  | "inset-right"
  // Keyboard
  | "keyboard-height"
  | "keyboard-visible"
  | "keyboard-floating"
  | "keyboard-inset"
  | "keyboard-duration"
  | "keyboard-curve"
  | "accessory-height"
  // Navigation state
  | "nav-depth"
  | "title-collapse"
  | "pop-gesture"
  | "sheet-visible"
  | "sheet-detent"
  // Device
  | "display-scale"
  | "display-corner"
  | "is-phone"
  | "is-tablet"
  | "is-desktop"
  | "is-portrait"
  | "is-landscape"
  | "is-compact-width"
  | "split-fraction"
  // Appearance
  | "is-dark"
  | "is-light"
  | "contrast"
  | "reduced-motion"
  | "reduced-transparency"
  | "accent-r"
  | "accent-g"
  | "accent-b"
  | "accent"
  // Dynamic Type
  | "font-scale"
  | "font-body"
  | "font-callout"
  | "font-caption1"
  | "font-caption2"
  | "font-footnote"
  | "font-headline"
  | "font-subheadline"
  | "font-title1"
  | "font-title2"
  | "font-title3"
  | "font-largeTitle";

// ─── Default values ───────────────────────────────────────────────────────────
// Returned when running outside of a Nativite WebView (browser dev mode).

const DEFAULTS: Record<NKVarName, string> = {
  "safe-top": "0px",
  "safe-bottom": "0px",
  "safe-left": "0px",
  "safe-right": "0px",
  "nav-height": "0px",
  "nav-visible": "0",
  "tab-height": "0px",
  "tab-visible": "0",
  "toolbar-height": "0px",
  "toolbar-visible": "0",
  "status-height": "0px",
  "inset-top": "0px",
  "inset-bottom": "0px",
  "inset-left": "0px",
  "inset-right": "0px",
  "keyboard-height": "0px",
  "keyboard-visible": "0",
  "keyboard-floating": "0",
  "keyboard-inset": "0px",
  "keyboard-duration": "250ms",
  "keyboard-curve": "ease-in-out",
  "accessory-height": "0px",
  "nav-depth": "0",
  "title-collapse": "0",
  "pop-gesture": "0",
  "sheet-visible": "0",
  "sheet-detent": "0",
  "display-scale": "2",
  "display-corner": "44px",
  "is-phone": "1",
  "is-tablet": "0",
  "is-desktop": "0",
  "is-portrait": "1",
  "is-landscape": "0",
  "is-compact-width": "0",
  "split-fraction": "1",
  "is-dark": "0",
  "is-light": "1",
  contrast: "0",
  "reduced-motion": "0",
  "reduced-transparency": "0",
  "accent-r": "0",
  "accent-g": "122",
  "accent-b": "255",
  accent: "rgb(0,122,255)",
  "font-scale": "1",
  "font-body": "17px",
  "font-callout": "16px",
  "font-caption1": "12px",
  "font-caption2": "11px",
  "font-footnote": "13px",
  "font-headline": "17px",
  "font-subheadline": "15px",
  "font-title1": "28px",
  "font-title2": "22px",
  "font-title3": "20px",
  "font-largeTitle": "34px",
};

// ─── NKVars ───────────────────────────────────────────────────────────────────

function cssVarName(name: NKVarName): string {
  return `--nk-${name}`;
}

/**
 * Read the current value of a single --nk-* variable.
 * Returns the typed default when running outside a native WebView.
 */
function get(name: NKVarName): string {
  if (typeof document === "undefined") return DEFAULTS[name];
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVarName(name))
    .trim();
  return value !== "" ? value : DEFAULTS[name];
}

/**
 * Read the current numeric value of a pixel variable (e.g. "336.0px" → 336).
 * Returns 0 for non-pixel variables.
 */
function getNumber(name: NKVarName): number {
  return parseFloat(get(name)) || 0;
}

/**
 * Read the current boolean flag (0 or 1) as a JS boolean.
 */
function getBoolean(name: NKVarName): boolean {
  return get(name) === "1";
}

// ─── Shared MutationObserver ─────────────────────────────────────────────────
// A single observer watches documentElement's style attribute and fans out to
// all active per-variable subscriptions. This avoids spawning one observer per
// NKVars.observe() call while keeping each subscription independent.

type Subscription = {
  lastValue: string;
  callback: (value: string) => void;
};

/** name → set of active subscriptions for that variable */
const subscriptions = new Map<NKVarName, Set<Subscription>>();

let sharedObserver: MutationObserver | null = null;

function getOrCreateObserver(): MutationObserver {
  if (sharedObserver) return sharedObserver;

  sharedObserver = new MutationObserver(() => {
    const style = getComputedStyle(document.documentElement);
    for (const [name, subs] of subscriptions) {
      if (subs.size === 0) continue;
      const prop = cssVarName(name);
      const raw = style.getPropertyValue(prop).trim();
      const resolved = raw !== "" ? raw : DEFAULTS[name];
      for (const sub of subs) {
        if (resolved !== sub.lastValue) {
          sub.lastValue = resolved;
          sub.callback(resolved);
        }
      }
    }
  });

  sharedObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
  });

  return sharedObserver;
}

/**
 * Subscribe to changes on a --nk-* variable.
 * Uses a single shared MutationObserver for all subscriptions.
 * Returns an unsubscribe function.
 *
 * @example
 * const unsub = NKVars.observe('keyboard-height', (v) => {
 *   console.log('Keyboard height changed to', v)
 * })
 */
function observe(name: NKVarName, callback: (value: string) => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {};

  getOrCreateObserver();

  const sub: Subscription = { lastValue: get(name), callback };

  if (!subscriptions.has(name)) {
    subscriptions.set(name, new Set());
  }
  subscriptions.get(name)!.add(sub);

  return () => {
    subscriptions.get(name)?.delete(sub);
  };
}

/**
 * Subscribe to a boolean flag (0 or 1 var) and receive a JS boolean.
 */
function observeBoolean(name: NKVarName, callback: (value: boolean) => void): () => void {
  return observe(name, (v) => callback(v === "1"));
}

/**
 * Subscribe to a pixel variable and receive a numeric pixel value.
 */
function observeNumber(name: NKVarName, callback: (value: number) => void): () => void {
  return observe(name, (v) => callback(parseFloat(v) || 0));
}

export const NKVars = {
  get,
  getNumber,
  getBoolean,
  observe,
  observeBoolean,
  observeNumber,
  /** All default values. Useful for server-side rendering. */
  defaults: DEFAULTS,
} as const;
