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

export type NativiteDevTarget = "simulator" | "device";

export type NativiteRootConfigOverrides = {
  app?: Partial<{
    name: string;
    bundleId: string;
    version: string;
    buildNumber: number;
  }>;
  signing?: {
    ios: {
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
    target: NativiteDevTarget;
    simulator: string;
    errorOverlay?: boolean;
  };
};

export type NativiteIOSPlatformConfig = {
  platform: "ios";
  minimumVersion: string;
  target?: NativiteDevTarget;
  simulator?: string;
  errorOverlay?: boolean;
  overrides?: NativiteRootConfigOverrides;
};

export type NativiteMacOSPlatformConfig = {
  platform: "macos";
  minimumVersion: string;
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

export type NativitePlatformDevContext = NativitePlatformHookContext & {
  devUrl: string;
  launchTarget: NativiteDevTarget;
  simulatorName: string;
};

export type NativitePlatformBuildContext = NativitePlatformHookContext & {
  outDir: string;
  manifest: BuildManifest;
};

export type NativitePlatformPlugin = {
  name: string;
  platform: string;
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
  dev?: (ctx: NativitePlatformDevContext) => void | Promise<void>;
  build?: (ctx: NativitePlatformBuildContext) => void | Promise<void>;
};

/**
 * Define iOS platform configuration in `nativite.config.ts`.
 *
 * @example
 * platforms: [ios({ minimumVersion: "17.0", target: "simulator", simulator: "iPhone 17 Pro", errorOverlay: false })]
 */
export function ios(
  config: Omit<NativiteIOSPlatformConfig, "platform">,
): NativiteIOSPlatformConfig {
  return { platform: "ios", ...config };
}

/**
 * Define macOS platform configuration in `nativite.config.ts`.
 *
 * @example
 * platforms: [macos({ minimumVersion: "14.0" })]
 */
export function macos(
  config: Omit<NativiteMacOSPlatformConfig, "platform">,
): NativiteMacOSPlatformConfig {
  return { platform: "macos", ...config };
}

/**
 * Define a custom platform configuration entry.
 *
 * @example
 * platforms: [platform("android", { minSdk: 26, targetDevice: "pixel-9" })]
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
    extensions?: unknown;
    environments?: unknown;
    generate?: unknown;
    dev?: unknown;
    build?: unknown;
  };
  if (typeof candidate.name !== "string" || candidate.name.length === 0) return false;
  if (typeof candidate.platform !== "string" || candidate.platform.length === 0) return false;
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
  if (candidate.dev !== undefined && typeof candidate.dev !== "function") return false;
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
    ios: {
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
    target: NativiteDevTarget;
    simulator: string;
    errorOverlay?: boolean;
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
        ios: z.object({
          mode: z.enum(["automatic", "manual"]),
          teamId: z.string(),
        }),
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
        target: z.enum(["simulator", "device"]),
        simulator: z.string(),
        errorOverlay: z.boolean().optional(),
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
    // signing.ios covers iOS code signing only. macOS targets use the
    // certificate and provisioning profile configured in Xcode directly.
    signing: z
      .object({
        ios: z.object({
          mode: z.enum(["automatic", "manual"]),
          teamId: z.string(),
        }),
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
    const firstPartyPlatformIds = new Set(["ios", "macos"]);
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
        if (typeof entry["minimumVersion"] !== "string" || entry["minimumVersion"].length === 0) {
          ctx.addIssue({
            code: "custom",
            path: ["platforms"],
            message: `Built-in platform "${entry.platform}" requires a string minimumVersion.`,
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
    const normalizedPlatformEntries = [...(config.platforms ?? [])] as NativitePlatformConfig[];
    const iosPlatformConfig = normalizedPlatformEntries.find(
      (entry): entry is NativiteIOSPlatformConfig => entry.platform === "ios",
    );

    const hasIosDevOverrides =
      iosPlatformConfig?.target !== undefined ||
      iosPlatformConfig?.simulator !== undefined ||
      iosPlatformConfig?.errorOverlay !== undefined;
    const normalizedDev = hasIosDevOverrides
      ? {
          target: iosPlatformConfig?.target ?? "simulator",
          simulator: iosPlatformConfig?.simulator ?? "iPhone 16 Pro",
          errorOverlay: iosPlatformConfig?.errorOverlay,
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
 * Available from both `nativite` and `nativite/vite` — prefer `nativite`
 * if you don't otherwise need the Vite peer dependency.
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

// ─── RPC Bridge Message Protocol ─────────────────────────────────────────────
// These types describe the wire format between JS and Swift. They are exported
// so that advanced users can build custom transports or plugins, but they are
// not part of the everyday Nativite API — most code only needs `bridge`.

/** @internal */
export type BridgeCallMessage = {
  /** null for fire-and-forget messages (e.g. chrome setState). */
  id: string | null;
  type: "call";
  /** Plugin namespace, e.g. "camera", "__nativite__", "__chrome__". */
  namespace: string;
  method: string;
  args: unknown;
};

/** @internal */
export type BridgeEventMessage = {
  id: null;
  type: "event";
  event: string;
  data: unknown;
};

/** @internal */
export type JsToNativeMessage = BridgeCallMessage;

/** @internal */
export type NativeToJsMessage = BridgeEventMessage;

// ─── Dev / Build State ────────────────────────────────────────────────────────

/** @internal */
export type DevJson = {
  devURL: string;
};

/** @internal */
export type BuildManifest = {
  platform: BundlePlatform;
  version: string;
  hash: string;
  assets: string[];
  builtAt: string;
};
