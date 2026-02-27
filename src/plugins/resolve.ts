import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type {
  NativiteApplePlatformContribution,
  NativiteConfig,
  NativitePlugin,
  NativitePluginContribution,
  NativitePluginDependency,
  NativitePluginFile,
  NativitePluginMode,
  NativitePluginRegistrar,
} from "../index.ts";

export type ResolvedNativitePluginFile = {
  pluginName: string;
  absolutePath: string;
};

export type ResolvedNativiteFrameworkDependency = {
  name: string;
  weak: boolean;
};

export type ResolvedNativitePlatformContribution = {
  sources: ResolvedNativitePluginFile[];
  resources: ResolvedNativitePluginFile[];
  registrars: string[];
  dependencies: ResolvedNativiteFrameworkDependency[];
};

export type ResolvedNativitePlugin = {
  name: string;
  rootDir: string;
  fingerprint: string;
  platforms: {
    ios: ResolvedNativitePlatformContribution;
    macos: ResolvedNativitePlatformContribution;
  };
};

export type ResolvedNativitePlugins = {
  plugins: ResolvedNativitePlugin[];
  platforms: {
    ios: ResolvedNativitePlatformContribution;
    macos: ResolvedNativitePlatformContribution;
  };
};

const PLATFORM_KEYS = ["ios", "macos"] as const;
type ApplePlatformKey = (typeof PLATFORM_KEYS)[number];

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toSerializable(entry, seen)).filter((entry) => entry !== undefined);
  }
  if (typeof value === "function" || value === undefined) {
    return undefined;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, entry] of entries) {
      const serializable = toSerializable(entry, seen);
      if (serializable !== undefined) out[key] = serializable;
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? "symbol";
  return undefined;
}

function emptyPlatformContribution(): ResolvedNativitePlatformContribution {
  return {
    sources: [],
    resources: [],
    registrars: [],
    dependencies: [],
  };
}

function mergeContributions(
  base: NativitePluginContribution | undefined,
  extra: NativitePluginContribution | undefined,
): NativitePluginContribution {
  const merged: NativitePluginContribution = {};

  const baseNamespaces = base?.bridge?.namespaces ?? [];
  const extraNamespaces = extra?.bridge?.namespaces ?? [];
  if (baseNamespaces.length > 0 || extraNamespaces.length > 0) {
    merged.bridge = {
      namespaces: [...baseNamespaces, ...extraNamespaces],
    };
  }

  const platforms: NativitePluginContribution["platforms"] = {};
  for (const platform of PLATFORM_KEYS) {
    const basePlatform = base?.platforms?.[platform];
    const extraPlatform = extra?.platforms?.[platform];
    if (!basePlatform && !extraPlatform) continue;

    platforms[platform] = {
      sources: [...(basePlatform?.sources ?? []), ...(extraPlatform?.sources ?? [])],
      resources: [...(basePlatform?.resources ?? []), ...(extraPlatform?.resources ?? [])],
      registrars: [...(basePlatform?.registrars ?? []), ...(extraPlatform?.registrars ?? [])],
      dependencies: [...(basePlatform?.dependencies ?? []), ...(extraPlatform?.dependencies ?? [])],
    };
  }

  if (Object.keys(platforms).length > 0) {
    merged.platforms = platforms;
  }

  return merged;
}

function normalizePathInput(input: NativitePluginFile): string {
  if (typeof input === "string") return input;
  return input.path;
}

function normalizeFiles(
  pluginName: string,
  rootDir: string,
  fileKind: "source" | "resource",
  files: NativitePluginFile[] | undefined,
): ResolvedNativitePluginFile[] {
  if (!files || files.length === 0) return [];

  const normalized: ResolvedNativitePluginFile[] = [];
  const seen = new Set<string>();

  for (const entry of files) {
    const rawPath = normalizePathInput(entry).trim();
    if (rawPath.length === 0) {
      throw new Error(`[nativite] Plugin "${pluginName}" declares an empty ${fileKind} path.`);
    }

    const absolutePath = resolve(rootDir, rawPath);
    if (!existsSync(absolutePath)) {
      throw new Error(
        `[nativite] Plugin "${pluginName}" ${fileKind} not found: ${rawPath} (resolved: ${absolutePath})`,
      );
    }

    if (seen.has(absolutePath)) continue;
    seen.add(absolutePath);
    normalized.push({ pluginName, absolutePath });
  }

  normalized.sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
  return normalized;
}

function normalizeRegistrarInput(input: NativitePluginRegistrar): string {
  if (typeof input === "string") return input;
  return input.symbol;
}

function normalizeRegistrars(
  pluginName: string,
  entries: NativitePluginRegistrar[] | undefined,
): string[] {
  if (!entries || entries.length === 0) return [];
  const symbols = new Set<string>();
  const symbolPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

  for (const entry of entries) {
    const symbol = normalizeRegistrarInput(entry).trim();
    if (symbol.length === 0) {
      throw new Error(`[nativite] Plugin "${pluginName}" declares an empty registrar symbol.`);
    }
    if (!symbolPattern.test(symbol)) {
      throw new Error(
        `[nativite] Plugin "${pluginName}" registrar "${symbol}" is invalid. ` +
          "Expected a Swift global function name like registerMyPlugin.",
      );
    }
    symbols.add(symbol);
  }

  return [...symbols];
}

function normalizeDependencyInput(
  dep: NativitePluginDependency,
): ResolvedNativiteFrameworkDependency {
  if (typeof dep === "string") {
    return { name: dep, weak: false };
  }

  const candidate = dep as { kind?: unknown; name?: unknown; weak?: unknown };
  if (candidate.kind !== undefined && candidate.kind !== "framework") {
    throw new Error(
      `[nativite] Unsupported dependency kind ${JSON.stringify(candidate.kind)}. Use kind: "framework".`,
    );
  }
  if (typeof candidate.name !== "string") {
    throw new Error("[nativite] Framework dependency name must be a string.");
  }

  return {
    name: candidate.name,
    weak: typeof candidate.weak === "boolean" ? candidate.weak : false,
  };
}

function normalizeDependencies(
  pluginName: string,
  entries: NativitePluginDependency[] | undefined,
): ResolvedNativiteFrameworkDependency[] {
  if (!entries || entries.length === 0) return [];

  const byName = new Map<string, boolean>();

  for (const entry of entries) {
    const normalized = normalizeDependencyInput(entry);
    const name = normalized.name.trim();
    if (name.length === 0) {
      throw new Error(
        `[nativite] Plugin "${pluginName}" declares a framework dependency with no name.`,
      );
    }

    const previousWeak = byName.get(name);
    if (previousWeak === undefined) {
      byName.set(name, normalized.weak);
    } else if (previousWeak && !normalized.weak) {
      // Strong link wins if both strong and weak variants are declared.
      byName.set(name, false);
    }
  }

  return [...byName.entries()]
    .map(([name, weak]) => ({ name, weak }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizePlatformContribution(
  pluginName: string,
  rootDir: string,
  contribution: NativiteApplePlatformContribution | undefined,
): ResolvedNativitePlatformContribution {
  if (!contribution) return emptyPlatformContribution();
  return {
    sources: normalizeFiles(pluginName, rootDir, "source", contribution.sources),
    resources: normalizeFiles(pluginName, rootDir, "resource", contribution.resources),
    registrars: normalizeRegistrars(pluginName, contribution.registrars),
    dependencies: normalizeDependencies(pluginName, contribution.dependencies),
  };
}

function aggregatePlatform(
  plugins: ResolvedNativitePlugin[],
  platform: ApplePlatformKey,
): ResolvedNativitePlatformContribution {
  const filesByPath = new Map<string, ResolvedNativitePluginFile>();
  const resourcesByPath = new Map<string, ResolvedNativitePluginFile>();
  const registrarSymbols = new Set<string>();
  const dependenciesByName = new Map<string, boolean>();

  for (const plugin of plugins) {
    const current = plugin.platforms[platform];

    for (const source of current.sources) {
      if (!filesByPath.has(source.absolutePath)) {
        filesByPath.set(source.absolutePath, source);
      }
    }

    for (const resource of current.resources) {
      if (!resourcesByPath.has(resource.absolutePath)) {
        resourcesByPath.set(resource.absolutePath, resource);
      }
    }

    for (const registrar of current.registrars) {
      registrarSymbols.add(registrar);
    }

    for (const dependency of current.dependencies) {
      const previousWeak = dependenciesByName.get(dependency.name);
      if (previousWeak === undefined) {
        dependenciesByName.set(dependency.name, dependency.weak);
      } else if (previousWeak && !dependency.weak) {
        dependenciesByName.set(dependency.name, false);
      }
    }
  }

  return {
    sources: [...filesByPath.values()].sort((a, b) => a.absolutePath.localeCompare(b.absolutePath)),
    resources: [...resourcesByPath.values()].sort((a, b) =>
      a.absolutePath.localeCompare(b.absolutePath),
    ),
    registrars: [...registrarSymbols],
    dependencies: [...dependenciesByName.entries()]
      .map(([name, weak]) => ({ name, weak }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function computePluginFingerprint(
  plugin: NativitePlugin,
  mergedContribution: NativitePluginContribution,
  normalized: ResolvedNativitePlugin["platforms"],
): string {
  if (typeof plugin.fingerprint === "string" && plugin.fingerprint.length > 0) {
    return hashString(`${plugin.name}:${plugin.fingerprint}`);
  }

  const pluginMeta = toSerializable(
    Object.fromEntries(
      Object.entries(plugin).filter(([key]) => {
        return (
          key !== "resolve" &&
          key !== "platforms" &&
          key !== "bridge" &&
          key !== "rootDir" &&
          key !== "fingerprint"
        );
      }),
    ),
  );

  return hashString(
    JSON.stringify({
      name: plugin.name,
      meta: pluginMeta,
      contribution: toSerializable(mergedContribution),
      normalized: {
        ios: {
          sources: normalized.ios.sources.map((s) => s.absolutePath),
          resources: normalized.ios.resources.map((r) => r.absolutePath),
          registrars: normalized.ios.registrars,
          dependencies: normalized.ios.dependencies,
        },
        macos: {
          sources: normalized.macos.sources.map((s) => s.absolutePath),
          resources: normalized.macos.resources.map((r) => r.absolutePath),
          registrars: normalized.macos.registrars,
          dependencies: normalized.macos.dependencies,
        },
      },
    }),
  );
}

function getStaticContribution(plugin: NativitePlugin): NativitePluginContribution {
  return {
    bridge: plugin.bridge,
    platforms: plugin.platforms,
  };
}

export async function resolveNativitePlugins(
  config: NativiteConfig,
  projectRoot: string,
  mode: NativitePluginMode,
): Promise<ResolvedNativitePlugins> {
  const plugins: NativitePlugin[] = config.plugins ?? [];
  const resolvedPlugins: ResolvedNativitePlugin[] = [];

  const configuredPlatforms = new Set((config.platforms ?? []).map((entry) => entry.platform));
  const iosEnabled = configuredPlatforms.has("ios");
  const macosEnabled = configuredPlatforms.has("macos");

  for (const plugin of plugins) {
    const rootDir = resolve(
      projectRoot,
      typeof plugin.rootDir === "string" && plugin.rootDir.length > 0 ? plugin.rootDir : ".",
    );

    const staticContribution = getStaticContribution(plugin);
    const dynamicContribution =
      typeof plugin.resolve === "function"
        ? await plugin.resolve({
            projectRoot,
            rootDir,
            mode,
          })
        : undefined;

    const mergedContribution = mergeContributions(staticContribution, dynamicContribution);

    const normalizedPlatforms = {
      ios: iosEnabled
        ? normalizePlatformContribution(plugin.name, rootDir, mergedContribution.platforms?.ios)
        : emptyPlatformContribution(),
      macos: macosEnabled
        ? normalizePlatformContribution(plugin.name, rootDir, mergedContribution.platforms?.macos)
        : emptyPlatformContribution(),
    };

    const fingerprint = computePluginFingerprint(plugin, mergedContribution, normalizedPlatforms);

    resolvedPlugins.push({
      name: plugin.name,
      rootDir,
      fingerprint,
      platforms: normalizedPlatforms,
    });
  }

  return {
    plugins: resolvedPlugins,
    platforms: {
      ios: aggregatePlatform(resolvedPlugins, "ios"),
      macos: aggregatePlatform(resolvedPlugins, "macos"),
    },
  };
}
