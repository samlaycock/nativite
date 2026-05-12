import type { Plugin } from "vite";

import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

// ─── Platform → candidate platform-extensions ────────────────────────────────
// Listed most-specific first. The universal fallback (bare extension) is
// handled by returning null from resolveId and letting Vite continue normally.

const BUILT_IN_PLATFORM_SUFFIXES: Record<string, string[]> = {
  ipad: [".ipad", ".ios", ".mobile", ".native"],
  ios: [".ios", ".mobile", ".native"],
  android: [".android", ".mobile", ".native"],
  macos: [".macos", ".desktop", ".native"],
  web: [".web"],
};

// Source extensions to probe when the import has no extension.
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css", ".svg", ".json"];

export interface PlatformIndexHtmlResolution {
  readonly fileName: string;
  readonly absolutePath: string;
}

interface PlatformResolution {
  readonly resolvedId: string | null;
  readonly dependencies: readonly string[];
}

function normalizedPlatformSuffixes(suffixes?: string[]): string[] | undefined {
  if (!suffixes || suffixes.length === 0) return undefined;
  return [...new Set(suffixes.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

export function platformSuffixesFor(platform: string, suffixes?: string[]): string[] {
  const normalizedSuffixes = normalizedPlatformSuffixes(suffixes);
  if (normalizedSuffixes) return normalizedSuffixes;
  return BUILT_IN_PLATFORM_SUFFIXES[platform] ?? [`.${platform}`, ".native"];
}

export function resolvePlatformIndexHtml(
  root: string,
  platform: string,
  suffixes?: string[],
): PlatformIndexHtmlResolution | undefined {
  const suffixesForPlatform = platformSuffixesFor(platform, suffixes);
  for (const suffix of suffixesForPlatform) {
    const fileName = `index${suffix}.html`;
    const absolutePath = join(root, fileName);
    if (existsSync(absolutePath)) {
      return {
        fileName,
        absolutePath,
      };
    }
  }
  return undefined;
}

// ─── platformExtensionsPlugin ────────────────────────────────────────────────

function findExistingCandidate(candidate: string, dependencies: string[]): string | undefined {
  dependencies.push(candidate);
  return existsSync(candidate) ? candidate : undefined;
}

function resolvePlatformImport(
  source: string,
  importer: string,
  suffixesForPlatform: readonly string[],
): PlatformResolution {
  const dependencies: string[] = [];
  const importerDir = dirname(importer);
  const sourceExt = extname(source); // e.g. ".tsx", or "" if no extension

  if (sourceExt) {
    // Import has an explicit extension, e.g. import './Button.tsx'
    // Try inserting platform suffix before the extension:
    //   ./Button.tsx  →  ./Button.ios.tsx
    const base = source.slice(0, -sourceExt.length);
    const absoluteBase = resolve(importerDir, base);

    for (const suffix of suffixesForPlatform) {
      const resolvedId = findExistingCandidate(
        `${absoluteBase}${suffix}${sourceExt}`,
        dependencies,
      );
      if (resolvedId) return { resolvedId, dependencies };
    }
  } else {
    // No extension — probe each source extension with and without suffix
    const absoluteBase = resolve(importerDir, source);

    for (const srcExt of SOURCE_EXTENSIONS) {
      // Try platform variants first
      for (const suffix of suffixesForPlatform) {
        const resolvedId = findExistingCandidate(`${absoluteBase}${suffix}${srcExt}`, dependencies);
        if (resolvedId) return { resolvedId, dependencies };
      }
      // Then the bare extension (universal fallback for this ext)
      const resolvedId = findExistingCandidate(`${absoluteBase}${srcExt}`, dependencies);
      if (resolvedId) return { resolvedId, dependencies };
    }

    // Try the source as a directory index
    for (const srcExt of SOURCE_EXTENSIONS) {
      for (const suffix of suffixesForPlatform) {
        const resolvedId = findExistingCandidate(
          join(absoluteBase, `index${suffix}${srcExt}`),
          dependencies,
        );
        if (resolvedId) return { resolvedId, dependencies };
      }
      const resolvedId = findExistingCandidate(join(absoluteBase, `index${srcExt}`), dependencies);
      if (resolvedId) return { resolvedId, dependencies };
    }
  }

  // No platform variant found — return null and let Vite resolve normally
  return { resolvedId: null, dependencies };
}

/**
 * Vite plugin that resolves platform-specific file variants.
 *
 * Given `import './Button'` on iOS, it tries in order:
 *   Button.ios.tsx → Button.mobile.tsx → Button.native.tsx → Button.tsx
 *
 * The resolution order per platform:
 * - ipad:    .ipad  → .ios → .mobile → .native → (fallback)
 * - ios:     .ios   → .mobile → .native → (fallback)
 * - android: .android → .mobile → .native → (fallback)
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
  const suffixesForPlatform = platformSuffixesFor(platform, suffixes);
  const resolutionCache = new Map<string, PlatformResolution>();
  const dependencyToCacheKeys = new Map<string, Set<string>>();

  function cacheKey(source: string, importer: string): string {
    return `${platform}\0${importer}\0${source}`;
  }

  function cacheResolution(key: string, resolution: PlatformResolution): void {
    resolutionCache.set(key, resolution);
    for (const dependency of resolution.dependencies) {
      const keys = dependencyToCacheKeys.get(dependency) ?? new Set<string>();
      keys.add(key);
      dependencyToCacheKeys.set(dependency, keys);
    }
  }

  function invalidateResolutionCache(file: string): void {
    const keys = dependencyToCacheKeys.get(file);
    if (!keys) return;

    for (const key of keys) {
      const resolution = resolutionCache.get(key);
      resolutionCache.delete(key);

      if (!resolution) continue;
      for (const dependency of resolution.dependencies) {
        const dependencyKeys = dependencyToCacheKeys.get(dependency);
        dependencyKeys?.delete(key);
        if (dependencyKeys?.size === 0) dependencyToCacheKeys.delete(dependency);
      }
    }
  }

  return {
    name: "nativite:platform-extensions",
    enforce: "pre",

    configureServer(server) {
      const invalidate = (file: string): void => {
        invalidateResolutionCache(resolve(file));
      };

      server.watcher.on("add", invalidate);
      server.watcher.on("unlink", invalidate);
    },

    resolveId(source, importer) {
      // Only act on relative and absolute path imports (not bare specifiers)
      if (!source.startsWith(".") && !source.startsWith("/")) return null;
      // Needs an importer to resolve relative paths
      if (!importer) return null;

      const key = cacheKey(source, importer);
      const cached = resolutionCache.get(key);
      if (cached) return cached.resolvedId;

      const resolution = resolvePlatformImport(source, importer, suffixesForPlatform);
      cacheResolution(key, resolution);
      return resolution.resolvedId;
    },
  };
}
