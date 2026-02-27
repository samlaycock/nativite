import type { NativiteConfig, NativitePlatformConfig, NativitePlatformPlugin } from "../index.ts";

import { FIRST_PARTY_PLATFORM_PLUGINS } from "./first-party.ts";

export type ResolvedNativitePlatformRuntime = {
  id: string;
  config: NativitePlatformConfig;
  plugin: NativitePlatformPlugin;
  extensions: string[];
  environments: string[];
  bundlePlatform: string;
};

type PlatformMetadata = {
  extensions: string[];
  environments: string[];
  bundlePlatform: string;
};

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function toDotPrefixedSuffixes(platformId: string, suffixes: string[] | undefined): string[] {
  if (!suffixes || suffixes.length === 0) return [`.${platformId}`, ".native"];
  return unique(
    suffixes
      .map((suffix) => suffix.trim())
      .filter((suffix) => suffix.length > 0)
      .map((suffix) => (suffix.startsWith(".") ? suffix : `.${suffix}`)),
  );
}

function normalizeEnvironments(platformId: string, environments: string[] | undefined): string[] {
  if (!environments || environments.length === 0) return [platformId];
  return unique(environments.map((entry) => entry.trim()).filter((entry) => entry.length > 0));
}

export function getConfiguredPlatforms(config: NativiteConfig): NativitePlatformConfig[] {
  return config.platforms ?? [];
}

export function resolveConfiguredPlatformRuntimes(
  config: NativiteConfig,
): ResolvedNativitePlatformRuntime[] {
  const configuredPlatforms = getConfiguredPlatforms(config);
  const pluginByPlatform = new Map<string, NativitePlatformPlugin>();
  for (const plugin of FIRST_PARTY_PLATFORM_PLUGINS) {
    pluginByPlatform.set(plugin.platform, plugin);
  }
  for (const plugin of config.platformPlugins ?? []) {
    pluginByPlatform.set(plugin.platform, plugin);
  }

  return configuredPlatforms.map((platformEntry) => {
    const plugin = pluginByPlatform.get(platformEntry.platform);
    if (!plugin) {
      throw new Error(
        `[nativite] Platform "${platformEntry.platform}" is configured, but no matching ` +
          "platform plugin was found in platformPlugins.",
      );
    }

    return {
      id: platformEntry.platform,
      config: platformEntry,
      plugin,
      extensions: toDotPrefixedSuffixes(platformEntry.platform, plugin.extensions),
      environments: normalizeEnvironments(platformEntry.platform, plugin.environments),
      bundlePlatform: platformEntry.platform,
    };
  });
}

export function resolvePlatformRuntimeById(
  config: NativiteConfig,
  platformId: string,
): ResolvedNativitePlatformRuntime | undefined {
  return resolveConfiguredPlatformRuntimes(config).find((runtime) => runtime.id === platformId);
}

function hasOwn<T extends object>(value: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function resolveConfigForPlatform(
  config: NativiteConfig,
  platformId: string,
): NativiteConfig {
  const runtime = resolvePlatformRuntimeById(config, platformId);
  const overrides = runtime?.config.overrides;
  if (!overrides) return config;

  const merged: NativiteConfig = {
    ...config,
    app: {
      ...config.app,
      ...overrides.app,
    },
  };

  if (hasOwn(overrides, "signing")) {
    merged.signing = overrides.signing;
  } else {
    merged.signing = config.signing;
  }

  if (hasOwn(overrides, "updates")) {
    merged.updates = overrides.updates;
  } else {
    merged.updates = config.updates;
  }

  if (hasOwn(overrides, "plugins")) {
    merged.plugins = overrides.plugins;
  } else {
    merged.plugins = config.plugins;
  }

  if (hasOwn(overrides, "defaultChrome")) {
    merged.defaultChrome = overrides.defaultChrome;
  } else {
    merged.defaultChrome = config.defaultChrome;
  }

  if (hasOwn(overrides, "icon")) {
    merged.icon = overrides.icon;
  } else {
    merged.icon = config.icon;
  }

  if (hasOwn(overrides, "splash")) {
    merged.splash = overrides.splash;
  } else {
    merged.splash = config.splash;
  }

  if (hasOwn(overrides, "dev")) {
    merged.dev = overrides.dev;
  } else {
    merged.dev = config.dev;
  }

  // Preserve configured platform metadata and platform plugins.
  merged.platforms = config.platforms;
  merged.platformPlugins = config.platformPlugins;

  return merged;
}

export function serializePlatformRuntimeMetadata(
  runtimes: ResolvedNativitePlatformRuntime[],
): string {
  return JSON.stringify(
    Object.fromEntries(
      runtimes.map((runtime) => [
        runtime.id,
        {
          extensions: runtime.extensions,
          environments: runtime.environments,
          bundlePlatform: runtime.bundlePlatform,
        },
      ]),
    ),
  );
}

export function deserializePlatformRuntimeMetadata(
  raw: string | undefined,
): Record<string, PlatformMetadata> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed).flatMap(([platform, value]) => {
      if (typeof value !== "object" || value === null) return [];
      const candidate = value as {
        extensions?: unknown;
        environments?: unknown;
        bundlePlatform?: unknown;
      };
      if (
        !Array.isArray(candidate.extensions) ||
        candidate.extensions.some((entry) => typeof entry !== "string")
      ) {
        return [];
      }
      if (
        !Array.isArray(candidate.environments) ||
        candidate.environments.some((entry) => typeof entry !== "string")
      ) {
        return [];
      }
      if (typeof candidate.bundlePlatform !== "string" || candidate.bundlePlatform.length === 0) {
        return [];
      }
      return [
        [
          platform,
          {
            extensions: toDotPrefixedSuffixes(platform, candidate.extensions),
            environments: normalizeEnvironments(platform, candidate.environments),
            bundlePlatform: candidate.bundlePlatform,
          },
        ] as const,
      ];
    });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}
