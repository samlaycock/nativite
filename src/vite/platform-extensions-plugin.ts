import type { Plugin } from "vite";

import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

// ─── Platform → candidate platform-extensions ────────────────────────────────
// Listed most-specific first. The universal fallback (bare extension) is
// handled by returning null from resolveId and letting Vite continue normally.

const BUILT_IN_PLATFORM_SUFFIXES: Record<string, string[]> = {
  ipad: [".ipad", ".ios", ".mobile", ".native"],
  ios: [".ios", ".mobile", ".native"],
  macos: [".macos", ".desktop", ".native"],
  web: [".web"],
};

// Source extensions to probe when the import has no extension.
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css", ".svg", ".json"];

// ─── platformExtensionsPlugin ────────────────────────────────────────────────

/**
 * Vite plugin that resolves platform-specific file variants.
 *
 * Given `import './Button'` on iOS, it tries in order:
 *   Button.ios.tsx → Button.mobile.tsx → Button.native.tsx → Button.tsx
 *
 * The resolution order per platform:
 * - ipad:    .ipad  → .ios → .mobile → .native → (fallback)
 * - ios:     .ios   → .mobile → .native → (fallback)
 * - macos:   .macos → .desktop → .native → (fallback)
 * - web:     .web → (fallback)
 *
 * Applied only to the "native" Vite environment — web "client" builds are
 * unaffected and continue resolving files as normal.
 *
 * @param platform - The target platform for this build/dev session.
 * @param suffixes - Optional suffix order override for custom platforms.
 */
export function platformExtensionsPlugin(platform: string, suffixes?: string[]): Plugin {
  const normalizedSuffixes =
    suffixes && suffixes.length > 0
      ? [...new Set(suffixes.map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
      : undefined;
  const suffixesForPlatform = normalizedSuffixes ??
    BUILT_IN_PLATFORM_SUFFIXES[platform] ?? [`.${platform}`, ".native"];

  return {
    name: "nativite:platform-extensions",
    enforce: "pre",

    resolveId(source, importer) {
      // Only act on relative and absolute path imports (not bare specifiers)
      if (!source.startsWith(".") && !source.startsWith("/")) return null;
      // Needs an importer to resolve relative paths
      if (!importer) return null;

      const importerDir = dirname(importer);
      const sourceExt = extname(source); // e.g. ".tsx", or "" if no extension

      if (sourceExt) {
        // Import has an explicit extension, e.g. import './Button.tsx'
        // Try inserting platform suffix before the extension:
        //   ./Button.tsx  →  ./Button.ios.tsx
        const base = source.slice(0, -sourceExt.length);
        const absoluteBase = resolve(importerDir, base);

        for (const suffix of suffixesForPlatform) {
          const candidate = `${absoluteBase}${suffix}${sourceExt}`;
          if (existsSync(candidate)) return candidate;
        }
      } else {
        // No extension — probe each source extension with and without suffix
        const absoluteBase = resolve(importerDir, source);

        for (const srcExt of SOURCE_EXTENSIONS) {
          // Try platform variants first
          for (const suffix of suffixesForPlatform) {
            const candidate = `${absoluteBase}${suffix}${srcExt}`;
            if (existsSync(candidate)) return candidate;
          }
          // Then the bare extension (universal fallback for this ext)
          const fallback = `${absoluteBase}${srcExt}`;
          if (existsSync(fallback)) return fallback;
        }

        // Try the source as a directory index
        for (const srcExt of SOURCE_EXTENSIONS) {
          for (const suffix of suffixesForPlatform) {
            const candidate = join(absoluteBase, `index${suffix}${srcExt}`);
            if (existsSync(candidate)) return candidate;
          }
          const fallback = join(absoluteBase, `index${srcExt}`);
          if (existsSync(fallback)) return fallback;
        }
      }

      // No platform variant found — return null and let Vite resolve normally
      return null;
    },
  };
}
