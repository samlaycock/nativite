import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

import { resolveNativitePluginRootDir } from "../plugin-root.ts";

export type ResolvedNativitePluginFile = {
  pluginName: string;
  absolutePath: string;
};

export type ResolvedNativiteFrameworkDependency = {
  name: string;
  weak: boolean;
  kind?: "framework";
};

export type ResolvedNativiteGradleDependency = {
  kind: "gradle";
  notation: string;
  configuration: string;
};

export type ResolvedNativiteVersionCatalogDependency = {
  kind: "version-catalog";
  alias: string;
  configuration: string;
};

export type ResolvedNativitePlatformContribution = {
  sources: ResolvedNativitePluginFile[];
  resources: ResolvedNativitePluginFile[];
  registrars: string[];
  dependencies: (
    | ResolvedNativiteFrameworkDependency
    | ResolvedNativiteGradleDependency
    | ResolvedNativiteVersionCatalogDependency
  )[];
  generatedAssets?: ResolvedNativitePluginFile[];
  metadata?: Record<string, unknown>;
  startupRegistrars?: string[];
  buildEntries?: ResolvedNativitePluginFile[];
};

export type ResolvedNativitePlugin = {
  name: string;
  rootDir: string;
  fingerprint: string;
  platforms: {
    ios: ResolvedNativitePlatformContribution;
    macos: ResolvedNativitePlatformContribution;
    android: ResolvedNativitePlatformContribution;
  };
};

export type ResolvedNativitePlugins = {
  plugins: ResolvedNativitePlugin[];
  platforms: {
    ios: ResolvedNativitePlatformContribution;
    macos: ResolvedNativitePlatformContribution;
    android: ResolvedNativitePlatformContribution;
  };
};

const PLATFORM_KEYS = ["ios", "macos", "android"] as const;
type PlatformKey = (typeof PLATFORM_KEYS)[number];
const moduleDir = dirname(fileURLToPath(import.meta.url));

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
    generatedAssets: [],
    metadata: {},
    startupRegistrars: [],
    buildEntries: [],
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
      generatedAssets: [
        ...(basePlatform?.generatedAssets ?? []),
        ...(extraPlatform?.generatedAssets ?? []),
      ],
      metadata: {
        ...basePlatform?.metadata,
        ...extraPlatform?.metadata,
      },
      appLifecycle:
        basePlatform?.appLifecycle || extraPlatform?.appLifecycle
          ? {
              startup: [
                ...(basePlatform?.appLifecycle?.startup ?? []),
                ...(extraPlatform?.appLifecycle?.startup ?? []),
              ],
            }
          : undefined,
      buildEntries: [...(basePlatform?.buildEntries ?? []), ...(extraPlatform?.buildEntries ?? [])],
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
  fileKind: "source" | "resource" | "generated asset" | "build entry",
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

function normalizeRegistrars(
  pluginName: string,
  entries: NativitePluginRegistrar[] | undefined,
  platform: PlatformKey,
  allowQualifiedAppleSymbol = false,
): string[] {
  if (!entries || entries.length === 0) return [];
  const symbols = new Set<string>();
  const symbolPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const qualifiedSymbolPattern = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/;

  for (const entry of entries) {
    const symbol = (typeof entry === "string" ? entry : entry.symbol).trim();
    const importPath = typeof entry === "string" ? undefined : entry.import?.trim();
    const normalizedSymbol = platform === "android" && importPath ? importPath : symbol;
    if (symbol.length === 0) {
      throw new Error(`[nativite] Plugin "${pluginName}" declares an empty registrar symbol.`);
    }
    if (importPath !== undefined && importPath.length === 0) {
      throw new Error(`[nativite] Plugin "${pluginName}" declares an empty registrar import.`);
    }
    if (importPath !== undefined && !importPath.endsWith(`.${symbol}`)) {
      throw new Error(
        `[nativite] Plugin "${pluginName}" registrar import "${importPath}" is invalid. ` +
          `Expected it to end with ".${symbol}".`,
      );
    }
    if (platform === "android" && importPath !== undefined && !symbolPattern.test(symbol)) {
      throw new Error(
        `[nativite] Plugin "${pluginName}" registrar "${symbol}" is invalid. ` +
          "Expected a Kotlin function name like registerMyPlugin.",
      );
    }
    if (
      platform === "android" &&
      !symbolPattern.test(normalizedSymbol) &&
      !qualifiedSymbolPattern.test(normalizedSymbol)
    ) {
      throw new Error(
        `[nativite] Plugin "${pluginName}" registrar "${normalizedSymbol}" is invalid. ` +
          "Expected a Kotlin function name or fully-qualified import like com.example.registerMyPlugin.",
      );
    }
    if (
      platform !== "android" &&
      !symbolPattern.test(symbol) &&
      (!allowQualifiedAppleSymbol || !qualifiedSymbolPattern.test(symbol))
    ) {
      throw new Error(
        `[nativite] Plugin "${pluginName}" registrar "${symbol}" is invalid. ` +
          "Expected a native function name like registerMyPlugin.",
      );
    }
    symbols.add(normalizedSymbol);
  }

  return [...symbols];
}

function normalizeFrameworkDependencyInput(
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

function normalizeGradleDependencyInput(
  dep: NativitePluginDependency,
): ResolvedNativiteGradleDependency | ResolvedNativiteVersionCatalogDependency {
  if (typeof dep === "string") {
    return { kind: "gradle", notation: dep, configuration: "implementation" };
  }

  const candidate = dep as {
    kind?: unknown;
    notation?: unknown;
    alias?: unknown;
    configuration?: unknown;
  };
  if (candidate.kind === "version-catalog") {
    if (typeof candidate.alias !== "string") {
      throw new Error("[nativite] Version-catalog dependency alias must be a string.");
    }

    return {
      kind: "version-catalog",
      alias: candidate.alias,
      configuration:
        typeof candidate.configuration === "string" ? candidate.configuration : "implementation",
    };
  }
  if (candidate.kind !== undefined && candidate.kind !== "gradle") {
    throw new Error(
      `[nativite] Unsupported Android dependency kind ${JSON.stringify(candidate.kind)}. Use kind: "gradle" or "version-catalog".`,
    );
  }
  if (typeof candidate.notation !== "string") {
    throw new Error("[nativite] Gradle dependency notation must be a string.");
  }

  return {
    kind: "gradle",
    notation: candidate.notation,
    configuration:
      typeof candidate.configuration === "string" ? candidate.configuration : "implementation",
  };
}

function normalizeDependencies(
  pluginName: string,
  entries: NativitePluginDependency[] | undefined,
  platform: PlatformKey,
): (
  | ResolvedNativiteFrameworkDependency
  | ResolvedNativiteGradleDependency
  | ResolvedNativiteVersionCatalogDependency
)[] {
  if (!entries || entries.length === 0) return [];

  if (platform === "android") {
    const byDeclaration = new Map<
      string,
      ResolvedNativiteGradleDependency | ResolvedNativiteVersionCatalogDependency
    >();

    for (const entry of entries) {
      const normalized = normalizeGradleDependencyInput(entry);
      const notation =
        normalized.kind === "version-catalog"
          ? normalized.alias.trim()
          : normalized.notation.trim();
      const configuration = normalized.configuration.trim();
      if (notation.length === 0) {
        throw new Error(
          `[nativite] Plugin "${pluginName}" declares an Android dependency with no notation or alias.`,
        );
      }
      if (configuration.length === 0) {
        throw new Error(
          `[nativite] Plugin "${pluginName}" declares a Gradle dependency with no configuration.`,
        );
      }

      byDeclaration.set(`${normalized.kind}:${configuration}:${notation}`, {
        ...normalized,
        ...(normalized.kind === "version-catalog" ? { alias: notation } : { notation }),
        configuration,
      });
    }

    return [...byDeclaration.values()].sort((a, b) =>
      `${a.configuration}:${a.kind === "version-catalog" ? a.alias : a.notation}`.localeCompare(
        `${b.configuration}:${b.kind === "version-catalog" ? b.alias : b.notation}`,
      ),
    );
  }

  const byName = new Map<string, boolean>();

  for (const entry of entries) {
    const normalized = normalizeFrameworkDependencyInput(entry);
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
  platform: PlatformKey,
): ResolvedNativitePlatformContribution {
  if (!contribution) return emptyPlatformContribution();
  return {
    sources: normalizeFiles(pluginName, rootDir, "source", contribution.sources),
    resources: normalizeFiles(pluginName, rootDir, "resource", contribution.resources),
    registrars: normalizeRegistrars(pluginName, contribution.registrars, platform),
    dependencies: normalizeDependencies(pluginName, contribution.dependencies, platform),
    generatedAssets: normalizeFiles(
      pluginName,
      rootDir,
      "generated asset",
      contribution.generatedAssets,
    ),
    metadata: contribution.metadata ?? {},
    startupRegistrars: normalizeRegistrars(
      pluginName,
      contribution.appLifecycle?.startup,
      platform,
      true,
    ),
    buildEntries: normalizeFiles(pluginName, rootDir, "build entry", contribution.buildEntries),
  };
}

function aggregatePlatform(
  plugins: ResolvedNativitePlugin[],
  platform: PlatformKey,
): ResolvedNativitePlatformContribution {
  const filesByPath = new Map<string, ResolvedNativitePluginFile>();
  const resourcesByPath = new Map<string, ResolvedNativitePluginFile>();
  const registrarSymbols = new Set<string>();
  const dependenciesByKey = new Map<
    string,
    | ResolvedNativiteFrameworkDependency
    | ResolvedNativiteGradleDependency
    | ResolvedNativiteVersionCatalogDependency
  >();
  const generatedAssetsByPath = new Map<string, ResolvedNativitePluginFile>();
  const metadata: Record<string, unknown> = {};
  const startupRegistrarSymbols = new Set<string>();
  const buildEntriesByPath = new Map<string, ResolvedNativitePluginFile>();

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
      if (dependency.kind === "gradle" || dependency.kind === "version-catalog") {
        const key = dependency.kind === "version-catalog" ? dependency.alias : dependency.notation;
        dependenciesByKey.set(`${dependency.kind}:${dependency.configuration}:${key}`, dependency);
        continue;
      }

      const key = dependency.name;
      const existing = dependenciesByKey.get(key) as
        | ResolvedNativiteFrameworkDependency
        | undefined;
      if (!existing) {
        dependenciesByKey.set(key, dependency);
      } else if (existing.weak && !dependency.weak) {
        dependenciesByKey.set(key, dependency);
      }
    }

    for (const asset of current.generatedAssets ?? []) {
      if (!generatedAssetsByPath.has(asset.absolutePath)) {
        generatedAssetsByPath.set(asset.absolutePath, asset);
      }
    }

    Object.assign(metadata, current.metadata ?? {});

    for (const registrar of current.startupRegistrars ?? []) {
      startupRegistrarSymbols.add(registrar);
    }

    for (const entry of current.buildEntries ?? []) {
      if (!buildEntriesByPath.has(entry.absolutePath)) {
        buildEntriesByPath.set(entry.absolutePath, entry);
      }
    }
  }

  return {
    sources: [...filesByPath.values()].sort((a, b) => a.absolutePath.localeCompare(b.absolutePath)),
    resources: [...resourcesByPath.values()].sort((a, b) =>
      a.absolutePath.localeCompare(b.absolutePath),
    ),
    registrars: [...registrarSymbols],
    dependencies: [...dependenciesByKey.values()].sort((a, b) => {
      const left =
        a.kind === "gradle"
          ? `${a.configuration}:${a.notation}`
          : a.kind === "version-catalog"
            ? `${a.configuration}:${a.alias}`
            : a.name;
      const right =
        b.kind === "gradle"
          ? `${b.configuration}:${b.notation}`
          : b.kind === "version-catalog"
            ? `${b.configuration}:${b.alias}`
            : b.name;
      return left.localeCompare(right);
    }),
    generatedAssets: [...generatedAssetsByPath.values()].sort((a, b) =>
      a.absolutePath.localeCompare(b.absolutePath),
    ),
    metadata,
    startupRegistrars: [...startupRegistrarSymbols],
    buildEntries: [...buildEntriesByPath.values()].sort((a, b) =>
      a.absolutePath.localeCompare(b.absolutePath),
    ),
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
          key !== "contracts" &&
          key !== "rootDir" &&
          key !== "fingerprint"
        );
      }),
    ),
  );

  const normalizedPlatforms: Record<string, unknown> = {};
  for (const key of PLATFORM_KEYS) {
    normalizedPlatforms[key] = {
      sources: normalized[key].sources.map((s) => s.absolutePath),
      resources: normalized[key].resources.map((r) => r.absolutePath),
      registrars: normalized[key].registrars,
      dependencies: normalized[key].dependencies,
      generatedAssets: normalized[key].generatedAssets?.map((r) => r.absolutePath),
      metadata: normalized[key].metadata,
      startupRegistrars: normalized[key].startupRegistrars,
      buildEntries: normalized[key].buildEntries?.map((r) => r.absolutePath),
    };
  }

  return hashString(
    JSON.stringify({
      name: plugin.name,
      meta: pluginMeta,
      contribution: toSerializable(mergedContribution),
      normalized: normalizedPlatforms,
    }),
  );
}

function backgroundRuntimePlugin(): NativitePlugin {
  const sourceRoot = resolve(moduleDir, "..");
  const sourceBackgroundBridge = resolve(
    sourceRoot,
    "native/ios/runtime/NativiteBackgroundBridge.swift",
  );
  const isSourceLayout = existsSync(sourceBackgroundBridge);
  const rootDir = isSourceLayout ? sourceRoot : moduleDir;

  return {
    name: "nativite-background-runtime",
    rootDir,
    fingerprint: "background-runtime-v1",
    platforms: {
      ios: {
        sources: [
          isSourceLayout
            ? "./native/ios/runtime/NativiteBackgroundBridge.swift"
            : "./runtime/NativiteBackgroundBridge.swift",
        ],
        registrars: ["registerNativiteBackgroundBridge"],
        appLifecycle: {
          startup: ["NativiteBackgroundTaskRuntime.registerAll"],
        },
        metadata: {
          infoPlist: {
            BGTaskSchedulerPermittedIdentifiers: "backgroundTasks",
            UIBackgroundModes: ["fetch"],
          },
        },
        generatedAssets: [
          isSourceLayout
            ? "./native/ios/runtime/NativiteBackgroundTasks.swift"
            : "./runtime/NativiteBackgroundTasks.swift",
        ],
        buildEntries: [isSourceLayout ? "./background.ts" : "./background.mjs"],
      },
      android: {
        registrars: ["registerNativiteBackgroundBridge"],
        dependencies: [
          { kind: "version-catalog", alias: "quickjs-kt-android" },
          { kind: "version-catalog", alias: "androidx-work-runtime-ktx" },
        ],
        generatedAssets: [
          isSourceLayout
            ? "./native/android/runtime/NativiteBackgroundTasks.kt"
            : "./runtime/NativiteBackgroundTasks.kt",
        ],
        buildEntries: [isSourceLayout ? "./background.ts" : "./background.mjs"],
      },
    },
  };
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
  const plugins: NativitePlugin[] =
    (config.backgroundTasks ?? []).length > 0
      ? [...(config.plugins ?? []), backgroundRuntimePlugin()]
      : (config.plugins ?? []);
  const resolvedPlugins: ResolvedNativitePlugin[] = [];

  const configuredPlatforms = new Set((config.platforms ?? []).map((entry) => entry.platform));
  const iosEnabled = configuredPlatforms.has("ios");
  const macosEnabled = configuredPlatforms.has("macos");
  const androidEnabled = configuredPlatforms.has("android");

  for (const plugin of plugins) {
    const rootDir = resolveNativitePluginRootDir(projectRoot, plugin.rootDir);

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
        ? normalizePlatformContribution(
            plugin.name,
            rootDir,
            mergedContribution.platforms?.ios,
            "ios",
          )
        : emptyPlatformContribution(),
      macos: macosEnabled
        ? normalizePlatformContribution(
            plugin.name,
            rootDir,
            mergedContribution.platforms?.macos,
            "macos",
          )
        : emptyPlatformContribution(),
      android: androidEnabled
        ? normalizePlatformContribution(
            plugin.name,
            rootDir,
            mergedContribution.platforms?.android,
            "android",
          )
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
      android: aggregatePlatform(resolvedPlugins, "android"),
    },
  };
}
