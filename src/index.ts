import { z } from "zod";

import type { ChromeState } from "./chrome/types.ts";

// ─── Plugin Types ────────────────────────────────────────────────────────────

export type NativitePluginMode = "generate" | "dev" | "build";

export type NativitePluginFile = string | { path: string };

export type NativitePluginRegistrar = string | { symbol: string };

export type NativiteFrameworkDependency =
  | string
  | { kind?: "framework"; name: string; weak?: boolean };

export type NativitePluginDependency = NativiteFrameworkDependency;

export type NativiteBridgeNamespace = {
  name: string;
  methods?: string[];
  events?: string[];
};

export type NativiteApplePlatformContribution = {
  sources?: NativitePluginFile[];
  resources?: NativitePluginFile[];
  registrars?: NativitePluginRegistrar[];
  dependencies?: NativitePluginDependency[];
};

export type NativitePluginContribution = {
  bridge?: {
    namespaces?: NativiteBridgeNamespace[];
  };
  platforms?: Record<string, NativiteApplePlatformContribution | undefined>;
};

export type NativitePluginContext = {
  projectRoot: string;
  rootDir: string;
  mode: NativitePluginMode;
};

export type NativitePlugin = {
  name: string;
  /**
   * Base directory for resolving relative plugin paths.
   * Defaults to the app project root when omitted.
   */
  rootDir?: string;
  /**
   * Optional manual cache key used by generation dirty-checking.
   * Useful when plugin contributions are dynamic.
   */
  fingerprint?: string;
  /** Optional static contribution block. */
  bridge?: NativitePluginContribution["bridge"];
  /** Optional static contribution block. */
  platforms?: NativitePluginContribution["platforms"];
  /**
   * Optional dynamic contribution resolver.
   * Runs during project generation/build to produce per-platform native inputs.
   */
  resolve?: (
    ctx: NativitePluginContext,
  ) => NativitePluginContribution | Promise<NativitePluginContribution>;
  [key: string]: unknown;
};

export const DEFAULT_IOS_MINIMUM_VERSION = "17.0";
export const DEFAULT_MACOS_MINIMUM_VERSION = "14.0";
export const DEFAULT_ANDROID_MIN_SDK = 26;
export const DEFAULT_ANDROID_TARGET_SDK = 35;

export type NativiteRootConfigOverrides = {
  app?: Partial<{
    name: string;
    bundleId: string;
    version: string;
    buildNumber: number;
  }>;
  signing?: {
    ios?: {
      mode: "automatic" | "manual";
      teamId: string;
    };
    macos?: {
      mode: "automatic" | "manual";
      teamId: string;
    };
  };
  updates?: {
    url: string;
    channel: string;
  };
  plugins?: NativitePlugin[];
  defaultChrome?: ChromeState;
  icon?: string;
  splash?: {
    backgroundColor: string;
    image?: string;
  };
  dev?: {
    errorOverlay: boolean;
  };
};

export type NativiteIOSPlatformConfig = {
  platform: "ios";
  minimumVersion: string;
  errorOverlay?: boolean;
  overrides?: NativiteRootConfigOverrides;
};

export type NativiteMacOSPlatformConfig = {
  platform: "macos";
  minimumVersion: string;
  overrides?: NativiteRootConfigOverrides;
};

export type NativiteAndroidPlatformConfig = {
  platform: "android";
  minSdk: number;
  targetSdk?: number;
  overrides?: NativiteRootConfigOverrides;
};

export type NativiteCustomPlatformConfig<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  platform: string;
  overrides?: NativiteRootConfigOverrides;
} & T;

export type NativitePlatformConfig =
  | NativiteIOSPlatformConfig
  | NativiteMacOSPlatformConfig
  | NativiteAndroidPlatformConfig
  | NativiteCustomPlatformConfig;

export type NativitePlatformLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type NativitePlatformHookContext = {
  rootConfig: NativiteConfig;
  config: NativiteConfig;
  projectRoot: string;
  platform: NativitePlatformConfig;
  logger: NativitePlatformLogger;
};

export type NativitePlatformGenerateContext = NativitePlatformHookContext & {
  force: boolean;
  mode?: NativitePluginMode;
};

export type NativitePlatformBuildContext = NativitePlatformHookContext & {
  outDir: string;
  manifest: {
    platform: BundlePlatform;
    version: string;
    hash: string;
    assets: string[];
    builtAt: string;
  };
};

export type NativitePlatformPlugin = {
  name: string;
  platform: string;
  /**
   * Whether this platform runs in a native shell/runtime.
   * Defaults to true when omitted.
   */
  native?: boolean;
  /**
   * Whether this platform is considered a mobile target family.
   * Used for `__IS_MOBILE__` compile-time define values.
   */
  mobile?: boolean;
  /**
   * Whether this platform is considered a desktop target family.
   * Used for `__IS_DESKTOP__` compile-time define values.
   */
  desktop?: boolean;
  /**
   * File-extension suffix order for this platform.
   * Example: [".android", ".mobile", ".native"]
   */
  extensions?: string[];
  /**
   * Vite environment names used by this platform in dev.
   * Defaults to [platform] when omitted.
   */
  environments?: string[];
  /**
   * Optional hooks for third-party platform lifecycle integration.
   */
  generate?: (ctx: NativitePlatformGenerateContext) => void | Promise<void>;
  build?: (ctx: NativitePlatformBuildContext) => void | Promise<void>;
};

/**
 * Define iOS platform configuration in `nativite.config.ts`.
 *
 * @example
 * platforms: [ios()]
 * platforms: [ios({ minimumVersion: "18.0", errorOverlay: false })]
 */
export function ios(
  config: Partial<Omit<NativiteIOSPlatformConfig, "platform" | "minimumVersion">> &
    Pick<Partial<NativiteIOSPlatformConfig>, "minimumVersion"> = {},
): NativiteIOSPlatformConfig {
  return { platform: "ios", minimumVersion: DEFAULT_IOS_MINIMUM_VERSION, ...config };
}

/**
 * Define macOS platform configuration in `nativite.config.ts`.
 *
 * @example
 * platforms: [macos()]
 * platforms: [macos({ minimumVersion: "15.0" })]
 */
export function macos(
  config: Partial<Omit<NativiteMacOSPlatformConfig, "platform" | "minimumVersion">> &
    Pick<Partial<NativiteMacOSPlatformConfig>, "minimumVersion"> = {},
): NativiteMacOSPlatformConfig {
  return { platform: "macos", minimumVersion: DEFAULT_MACOS_MINIMUM_VERSION, ...config };
}

/**
 * Define Android platform configuration in `nativite.config.ts`.
 *
 * @example
 * platforms: [android()]
 * platforms: [android({ minSdk: 28 })]
 */
export function android(
  config: Partial<Omit<NativiteAndroidPlatformConfig, "platform" | "minSdk">> &
    Pick<Partial<NativiteAndroidPlatformConfig>, "minSdk"> = {},
): NativiteAndroidPlatformConfig {
  return { platform: "android", minSdk: DEFAULT_ANDROID_MIN_SDK, ...config };
}

/**
 * Define a custom platform configuration entry.
 *
 * @example
 * platforms: [platform("custom", { foo: "bar" })]
 */
export function platform<T extends Record<string, unknown>>(
  name: string,
  config?: T,
): NativiteCustomPlatformConfig<T> {
  return { platform: name, ...(config ?? ({} as T)) };
}

/**
 * Identity helper for platform plugin authoring.
 */
export function definePlatformPlugin(plugin: NativitePlatformPlugin): NativitePlatformPlugin {
  return plugin;
}

/**
 * Identity helper for plugin authoring.
 *
 * @example
 * import { definePlugin } from "nativite"
 * export const myPlugin = definePlugin({ name: "my-plugin", ... })
 */
export function definePlugin(plugin: NativitePlugin): NativitePlugin {
  return plugin;
}

function isPluginConfig(value: unknown): value is NativitePlugin {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { name?: unknown; resolve?: unknown };
  if (typeof candidate.name !== "string" || candidate.name.length === 0) return false;
  if (candidate.resolve !== undefined && typeof candidate.resolve !== "function") return false;
  return true;
}

function isPlatformPluginConfig(value: unknown): value is NativitePlatformPlugin {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    name?: unknown;
    platform?: unknown;
    native?: unknown;
    mobile?: unknown;
    desktop?: unknown;
    extensions?: unknown;
    environments?: unknown;
    generate?: unknown;
    build?: unknown;
  };
  if (typeof candidate.name !== "string" || candidate.name.length === 0) return false;
  if (typeof candidate.platform !== "string" || candidate.platform.length === 0) return false;
  if (candidate.native !== undefined && typeof candidate.native !== "boolean") return false;
  if (candidate.mobile !== undefined && typeof candidate.mobile !== "boolean") return false;
  if (candidate.desktop !== undefined && typeof candidate.desktop !== "boolean") return false;
  if (
    candidate.extensions !== undefined &&
    (!Array.isArray(candidate.extensions) ||
      candidate.extensions.some((entry) => typeof entry !== "string"))
  ) {
    return false;
  }
  if (
    candidate.environments !== undefined &&
    (!Array.isArray(candidate.environments) ||
      candidate.environments.some((entry) => typeof entry !== "string"))
  ) {
    return false;
  }
  if (candidate.generate !== undefined && typeof candidate.generate !== "function") return false;
  if (candidate.build !== undefined && typeof candidate.build !== "function") return false;
  return true;
}

type NormalizedNativiteConfig = {
  app: {
    name: string;
    bundleId: string;
    version: string;
    buildNumber: number;
  };
  platforms?: NativitePlatformConfig[];
  platformPlugins?: NativitePlatformPlugin[];
  signing?: {
    ios?: {
      mode: "automatic" | "manual";
      teamId: string;
    };
    macos?: {
      mode: "automatic" | "manual";
      teamId: string;
    };
  };
  updates?: {
    url: string;
    channel: string;
  };
  plugins?: NativitePlugin[];
  defaultChrome?: ChromeState;
  icon?: string;
  splash?: {
    backgroundColor: string;
    image?: string;
  };
  dev?: {
    errorOverlay: boolean;
  };
};

const RootConfigOverridesSchema = z
  .object({
    app: z
      .object({
        name: z
          .string()
          .regex(
            /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/,
            "app.name may only contain letters, numbers, spaces, hyphens, and underscores, " +
              "and must start with a letter or number",
          )
          .optional(),
        bundleId: z
          .string()
          .regex(
            /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i,
            "bundleId must be a reverse-domain identifier like com.example.myapp",
          )
          .optional(),
        version: z.string().min(1).optional(),
        buildNumber: z.number().int().min(1).optional(),
      })
      .optional(),
    signing: z
      .object({
        ios: z
          .object({
            mode: z.enum(["automatic", "manual"]),
            teamId: z.string(),
          })
          .optional(),
        macos: z
          .object({
            mode: z.enum(["automatic", "manual"]),
            teamId: z.string(),
          })
          .optional(),
      })
      .optional(),
    updates: z
      .object({
        url: z.string().url(),
        channel: z.string(),
      })
      .optional(),
    plugins: z
      .array(
        z.custom<NativitePlugin>(isPluginConfig, {
          message: "Each plugin must be an object with a non-empty string `name`.",
        }),
      )
      .optional(),
    defaultChrome: z.custom<ChromeState>().optional(),
    icon: z.string().optional(),
    splash: z
      .object({
        backgroundColor: z.string(),
        image: z.string().optional(),
      })
      .optional(),
    dev: z
      .object({
        errorOverlay: z.boolean(),
      })
      .optional(),
  })
  .optional();

// ─── Config Schema ────────────────────────────────────────────────────────────

export const NativiteConfigSchema = z
  .object({
    app: z
      .object({
        name: z
          .string()
          .min(1)
          .regex(
            /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/,
            "app.name may only contain letters, numbers, spaces, hyphens, and underscores, " +
              "and must start with a letter or number",
          ),
        bundleId: z
          .string()
          .regex(
            /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i,
            "bundleId must be a reverse-domain identifier like com.example.myapp",
          ),
        version: z.string().min(1),
        buildNumber: z.number().int().min(1),
      })
      .strict(),
    platforms: z
      .array(
        z
          .object({
            platform: z.string().min(1),
            overrides: RootConfigOverridesSchema,
          })
          .passthrough(),
      )
      .refine(
        (entries) => new Set(entries.map((entry) => entry.platform)).size === entries.length,
        {
          message: "Platform entries must be unique by platform name.",
        },
      )
      .optional(),
    platformPlugins: z
      .array(
        z.custom<NativitePlatformPlugin>(isPlatformPluginConfig, {
          message:
            "Each platform plugin must include non-empty string `name` and `platform` fields.",
        }),
      )
      .refine((arr) => new Set(arr.map((p) => p.platform)).size === arr.length, {
        message: "Platform plugins must target unique platform names.",
      })
      .optional(),
    signing: z
      .object({
        ios: z
          .object({
            mode: z.enum(["automatic", "manual"]),
            teamId: z.string(),
          })
          .optional(),
        macos: z
          .object({
            mode: z.enum(["automatic", "manual"]),
            teamId: z.string(),
          })
          .optional(),
      })
      .optional(),
    updates: z
      .object({
        url: z.string().url(),
        channel: z.string(),
      })
      .optional(),
    plugins: z
      .array(
        z.custom<NativitePlugin>(isPluginConfig, {
          message: "Each plugin must be an object with a non-empty string `name`.",
        }),
      )
      .refine((arr) => new Set(arr.map((p) => p.name)).size === arr.length, {
        message: "Plugin names must be unique.",
      })
      .optional(),
    // z.custom is used here because ChromeState is a complex discriminated union
    // that would be expensive to duplicate in Zod. The TypeScript type annotation
    // still gives full authoring-time safety; runtime validation is intentionally
    // skipped for this field.
    defaultChrome: z.custom<ChromeState>().optional(),
    /** Path to a 1024×1024 PNG app icon (relative to project root). */
    icon: z.string().optional(),
    splash: z
      .object({
        backgroundColor: z.string(),
        image: z.string().optional(),
      })
      .optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const firstPartyPlatformIds = new Set(["ios", "macos", "android"]);
    const hasTopLevelPlatforms = (config.platforms?.length ?? 0) > 0;

    if (!hasTopLevelPlatforms) {
      ctx.addIssue({
        code: "custom",
        path: ["platforms"],
        message: "At least one platform must be configured via platforms: [ios(...), macos(...)].",
      });
    }

    for (const entry of config.platforms ?? []) {
      if (entry.platform === "ios" || entry.platform === "macos") {
        if (
          entry["minimumVersion"] !== undefined &&
          (typeof entry["minimumVersion"] !== "string" || entry["minimumVersion"].length === 0)
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["platforms"],
            message: `Built-in platform "${entry.platform}" minimumVersion must be a non-empty string when provided.`,
          });
        }
      }

      if (entry.platform === "ios") {
        if (entry["target"] !== undefined || entry["simulator"] !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["platforms"],
            message:
              'Built-in platform "ios" no longer supports terminal-owned dev target or simulator options.',
          });
        }
      }

      if (entry.platform === "android") {
        if (
          entry["minSdk"] !== undefined &&
          (typeof entry["minSdk"] !== "number" || !Number.isInteger(entry["minSdk"]))
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["platforms"],
            message: 'Built-in platform "android" minSdk must be an integer when provided.',
          });
        }
        if (entry["targetSdk"] !== undefined && !Number.isInteger(entry["targetSdk"])) {
          ctx.addIssue({
            code: "custom",
            path: ["platforms"],
            message: 'Built-in platform "android" targetSdk must be an integer when provided.',
          });
        }
      }
    }

    for (const plugin of config.platformPlugins ?? []) {
      if (firstPartyPlatformIds.has(plugin.platform)) {
        ctx.addIssue({
          code: "custom",
          path: ["platformPlugins"],
          message:
            `Platform plugin "${plugin.platform}" is reserved for Nativite first-party ` +
            "platform support and cannot be overridden.",
        });
      }
    }

    const pluginPlatforms = new Set([
      ...firstPartyPlatformIds,
      ...(config.platformPlugins ?? []).map((plugin) => plugin.platform),
    ]);
    for (const entry of config.platforms ?? []) {
      if (!pluginPlatforms.has(entry.platform)) {
        ctx.addIssue({
          code: "custom",
          path: ["platformPlugins"],
          message:
            `Platform "${entry.platform}" requires a matching platform plugin entry in ` +
            "platformPlugins.",
        });
      }
    }
  })
  .transform<NormalizedNativiteConfig>((config) => {
    const normalizedPlatformEntries = (config.platforms ?? []).map((entry) => {
      if (entry.platform === "ios") {
        return {
          ...entry,
          minimumVersion: entry["minimumVersion"] ?? DEFAULT_IOS_MINIMUM_VERSION,
        } as NativiteIOSPlatformConfig;
      }
      if (entry.platform === "macos") {
        return {
          ...entry,
          minimumVersion: entry["minimumVersion"] ?? DEFAULT_MACOS_MINIMUM_VERSION,
        } as NativiteMacOSPlatformConfig;
      }
      if (entry.platform === "android") {
        return {
          ...entry,
          minSdk: entry["minSdk"] ?? DEFAULT_ANDROID_MIN_SDK,
          targetSdk: entry["targetSdk"] ?? DEFAULT_ANDROID_TARGET_SDK,
        } as NativiteAndroidPlatformConfig;
      }
      return entry as NativitePlatformConfig;
    });
    const iosPlatformConfig = normalizedPlatformEntries.find(
      (entry): entry is NativiteIOSPlatformConfig => entry.platform === "ios",
    );

    const hasIosDevOverrides = iosPlatformConfig?.errorOverlay !== undefined;
    const normalizedDev = hasIosDevOverrides
      ? {
          errorOverlay: iosPlatformConfig.errorOverlay!,
        }
      : undefined;

    const normalized: NormalizedNativiteConfig = {
      app: {
        name: config.app.name,
        bundleId: config.app.bundleId,
        version: config.app.version,
        buildNumber: config.app.buildNumber,
      },
    };

    if (normalizedPlatformEntries.length > 0) {
      normalized.platforms = normalizedPlatformEntries as NativitePlatformConfig[];
    }
    if (config.platformPlugins && config.platformPlugins.length > 0) {
      normalized.platformPlugins = config.platformPlugins;
    }
    if (config.signing) normalized.signing = config.signing;
    if (config.updates) normalized.updates = config.updates;
    if (config.plugins) normalized.plugins = config.plugins;
    if (config.defaultChrome !== undefined) normalized.defaultChrome = config.defaultChrome;
    if (config.icon !== undefined) normalized.icon = config.icon;
    if (config.splash) normalized.splash = config.splash;
    if (normalizedDev) normalized.dev = normalizedDev;

    return normalized;
  });

export type NativiteUserConfig = z.input<typeof NativiteConfigSchema>;
export type NativiteConfig = z.output<typeof NativiteConfigSchema>;

/**
 * Identity helper for type inference in `nativite.config.ts`.
 * Available from `nativite`.
 *
 * @example
 * import { defineConfig } from 'nativite'
 * export default defineConfig({ app: { name: 'MyApp', ... } })
 */
export function defineConfig<T extends NativiteUserConfig>(config: T): T {
  return config;
}

// ─── Platform ─────────────────────────────────────────────────────────────────

// Platforms supported for file-extension resolution (.ios.tsx, .ipad.tsx, etc.)
// and mode detection.
export type Platform = "ios" | "ipad" | "macos" | "web" | (string & {});
export type BundlePlatform = "ios" | "macos" | (string & {});
