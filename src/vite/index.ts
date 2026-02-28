import type {
  Environment,
  EnvironmentOptions,
  HotUpdateOptions,
  Plugin,
  ResolvedConfig,
  UserConfig,
} from "vite";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, watchFile, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

import {
  NativiteConfigSchema,
  type BundlePlatform,
  type BuildManifest,
  type NativiteConfig,
  type Platform,
} from "../index.ts";
import {
  deserializePlatformRuntimeMetadata,
  resolveConfigForPlatform,
  resolveConfiguredPlatformRuntimes,
} from "../platforms/registry.ts";
import { platformExtensionsPlugin } from "./platform-extensions-plugin.ts";
import { shouldTransformNativeRequest } from "./request-routing.ts";

export type { NativiteConfig, Platform };
export { defineConfig } from "../index.ts";
export { platformExtensionsPlugin };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLanIp(): string | undefined {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return undefined;
}

function collectAssets(dir: string, root: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) {
        results.push(...collectAssets(full, root));
      } else {
        results.push(full.slice(root.length + 1));
      }
    } catch {
      // Skip files that become inaccessible mid-traversal (e.g. temp files
      // deleted by the build tool between readdir and stat).
    }
  }
  return results;
}

type PlatformRuntimeMetadata = {
  extensions: string[];
  environments: string[];
  bundlePlatform: string;
};

function runtimeMetadataFromEnv(): Record<string, PlatformRuntimeMetadata> {
  return deserializePlatformRuntimeMetadata(process.env["NATIVITE_PLATFORM_METADATA"]);
}

function toBundlePlatform(
  platform: string | undefined,
  metadata: Record<string, PlatformRuntimeMetadata>,
): BundlePlatform | undefined {
  if (!platform) return undefined;
  if (platform === "ios" || platform === "ipad") return "ios";
  if (platform === "macos") return "macos";
  const configured = metadata[platform];
  if (configured?.bundlePlatform) return configured.bundlePlatform;
  return platform;
}

function platformOutDir(baseOutDir: string, platform: BundlePlatform): string {
  const normalizedBase = baseOutDir.replace(/[\\/]+$/, "");
  return `${normalizedBase}-${platform}`;
}

// ─── Config loading ───────────────────────────────────────────────────────────

/**
 * Load and parse nativite.config.ts from the given project root.
 * Uses Vite's loadConfigFromFile so TypeScript configs are transpiled on the fly.
 */
async function loadNativiteConfigFromDir(root: string): Promise<NativiteConfig> {
  const configFile = join(root, "nativite.config.ts");

  let loadConfigFromFile: (
    env: { command: "build" | "serve"; mode: string },
    configFile?: string,
    configRoot?: string,
  ) => Promise<{ config: unknown } | null>;

  try {
    const vite = await import("vite");
    loadConfigFromFile = vite.loadConfigFromFile;
  } catch {
    throw new Error("[nativite] Could not import vite. Make sure vite is installed.");
  }

  const result = await loadConfigFromFile(
    { command: "build", mode: "production" },
    configFile,
    root,
  );

  if (!result) {
    throw new Error(
      `[nativite] Could not load nativite.config.ts from ${root}. ` +
        "Make sure the file exists and exports a default config via defineConfig().",
    );
  }

  return NativiteConfigSchema.parse(result.config);
}

// ─── Environment options factory ──────────────────────────────────────────────
// The "native" environment is a distinct named Vite environment representing
// the WKWebView runtime. It shares browser semantics with "client" but gets
// platform-specific defines and is targeted by Nativite's own plugin hooks.

function devDefineValue(mode: string): string {
  return JSON.stringify(mode !== "production");
}

function parseBooleanEnv(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
}

function nativeEnvironmentOptions(platform: Platform, mode: string): EnvironmentOptions {
  return {
    consumer: "client",
    define: {
      // Vite-namespaced flag — import.meta.env.VITE_NATIVITE
      "import.meta.env.VITE_NATIVITE": "true",
      // Global constants — available without importing anything
      __PLATFORM__: JSON.stringify(platform),
      __IS_NATIVE__: "true",
      __DEV__: devDefineValue(mode),
    },
    dev: {
      preTransformRequests: true,
    },
    // Each environment has its own dep optimizer. Exclude nativite packages
    // so the optimizer does not try to bundle native-only runtime modules
    // that rely on the webkit message handler bridge.
    optimizeDeps: {
      exclude: ["nativite", "nativite/chrome", "nativite/client", "nativite/css-vars"],
    },
  };
}

function isNativeVariantFile(file: string, suffixes: Set<string>): boolean {
  const normalized = file.replaceAll("\\", "/");
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  for (const suffix of suffixes) {
    if (basename.includes(`${suffix}.`)) return true;
  }
  return false;
}

function canonicalizeNativeVariantUrl(url: string, suffixes: Set<string>): string | undefined {
  const queryIndex = url.search(/[?#]/);
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? "" : url.slice(queryIndex);
  const slashIndex = pathname.lastIndexOf("/");
  const dirname = slashIndex === -1 ? "" : pathname.slice(0, slashIndex + 1);
  const basename = slashIndex === -1 ? pathname : pathname.slice(slashIndex + 1);

  const orderedSuffixes = [...suffixes].sort((a, b) => b.length - a.length);
  for (const variantSuffix of orderedSuffixes) {
    const marker = `${variantSuffix}.`;
    const markerIndex = basename.lastIndexOf(marker);
    if (markerIndex === -1) continue;
    const canonicalBasename =
      basename.slice(0, markerIndex) + basename.slice(markerIndex + variantSuffix.length);
    return `${dirname}${canonicalBasename}${suffix}`;
  }

  return undefined;
}

// ─── Core plugin (internal) ───────────────────────────────────────────────────

function nativiteCorePlugin(): Plugin {
  let viteConfig: ResolvedConfig;
  let nativiteDir: string;
  // Config is loaded asynchronously in configResolved; all hooks that use it
  // run after configResolved so the assignment is always complete.
  let config: NativiteConfig;
  let platformMetadata = runtimeMetadataFromEnv();
  let configuredPlatformRuntimes = [] as ReturnType<typeof resolveConfiguredPlatformRuntimes>;
  let configuredNativeEnvironmentNames = new Set<string>(["ios", "ipad", "macos"]);
  let nativeVariantSuffixes = new Set<string>([
    ".ios",
    ".ipad",
    ".mobile",
    ".native",
    ".macos",
    ".desktop",
  ]);
  let buildPlatform: BundlePlatform | undefined;
  let lastNativeVariantClientUpdateToken: string | undefined;

  return {
    name: "nativite",
    enforce: "post" as const,

    // ── Register per-platform environments ────────────────────────────────
    // In dev (serve): all three native environments are registered so any
    // WKWebView can connect to its correct environment via UA-based routing.
    // In build: only the target platform's environment is registered
    //   (NATIVITE_PLATFORM is set by the CLI).
    // Plain `vite build` with no env var: no native environments, so native
    //   code never enters the web bundle.
    config(userConfig, { mode, command }): Partial<UserConfig> {
      const envPlatform = process.env["NATIVITE_PLATFORM"] as Platform | undefined;
      platformMetadata = runtimeMetadataFromEnv();
      buildPlatform = toBundlePlatform(envPlatform, platformMetadata);

      const nativePlatforms: Platform[] = [];
      if (command === "serve") {
        const metadataEnvironments = Object.values(platformMetadata).flatMap(
          (entry) => entry.environments,
        );
        const environments =
          metadataEnvironments.length > 0
            ? metadataEnvironments
            : (["ios", "ipad", "macos"] as string[]);
        for (const environment of environments) {
          nativePlatforms.push(environment as Platform);
        }
      } else if (envPlatform && envPlatform !== "web") {
        nativePlatforms.push(envPlatform);
      }

      configuredNativeEnvironmentNames = new Set(nativePlatforms);
      const buildOutDir =
        command === "build" && buildPlatform
          ? platformOutDir(userConfig.build?.outDir ?? "dist", buildPlatform)
          : undefined;
      const nativeBuildBase =
        command === "build" && envPlatform && envPlatform !== "web" && userConfig.base === undefined
          ? "./"
          : undefined;
      const nativeErrorOverlay =
        parseBooleanEnv(process.env["NATIVITE_DEV_ERROR_OVERLAY"]) ?? false;
      const hmrConfig = userConfig.server?.hmr;
      const serverConfig =
        command === "serve"
          ? {
              hmr:
                hmrConfig === false
                  ? false
                  : typeof hmrConfig === "object" && hmrConfig !== null
                    ? { ...hmrConfig, overlay: nativeErrorOverlay }
                    : { overlay: nativeErrorOverlay },
            }
          : undefined;
      const userOptimizeDeps = userConfig.optimizeDeps ?? {};
      const optimizeDepsExclude = Array.from(
        new Set([
          ...(userOptimizeDeps.exclude ?? []),
          "nativite/chrome",
          "nativite/client",
          "nativite/css-vars",
        ]),
      );

      const environments: Record<string, EnvironmentOptions> = {};
      for (const p of nativePlatforms) {
        environments[p] = nativeEnvironmentOptions(p, mode);
      }

      return {
        // Global defines default to web — nativeEnvironmentOptions overrides
        // __PLATFORM__ and __IS_NATIVE__ for each native platform environment.
        define: {
          __PLATFORM__: JSON.stringify("web"),
          __IS_NATIVE__: "false",
          __DEV__: devDefineValue(mode),
        },
        ...(serverConfig ? { server: serverConfig } : {}),
        ...(nativeBuildBase ? { base: nativeBuildBase } : {}),
        ...(buildOutDir ? { build: { outDir: buildOutDir } } : {}),
        optimizeDeps: {
          ...userOptimizeDeps,
          exclude: optimizeDepsExclude,
        },
        environments,
      };
    },

    async configResolved(resolved: ResolvedConfig) {
      viteConfig = resolved;
      nativiteDir = join(viteConfig.root, ".nativite");
      // Load nativite.config.ts now that we know the project root.
      config = await loadNativiteConfigFromDir(viteConfig.root);
      configuredPlatformRuntimes = resolveConfiguredPlatformRuntimes(config);
      configuredNativeEnvironmentNames = new Set(
        configuredPlatformRuntimes.flatMap((runtime) => runtime.environments),
      );
      nativeVariantSuffixes = new Set(
        configuredPlatformRuntimes.flatMap((runtime) => runtime.extensions).concat(".native"),
      );
    },

    // ── Dev mode ──────────────────────────────────────────────────────────
    async configureServer(server: {
      config: ResolvedConfig;
      resolvedUrls: { local: string[]; network: string[] } | null;
      httpServer: {
        once(event: string, cb: () => void): void;
      } | null;
      watcher: { on(event: string, cb: (file: string) => void): void };
      environments: Record<
        string,
        { transformRequest(url: string): Promise<{ code: string; etag?: string } | null> }
      >;
      middlewares: {
        use(
          handler: (
            req: { url?: string; headers: Record<string, string | string[] | undefined> },
            res: {
              setHeader(name: string, value: string): void;
              statusCode: number;
              end(body?: string): void;
            },
            next: (err?: unknown) => void,
          ) => void,
        ): void;
      };
    }) {
      // ── Middleware: route each WKWebView to its named platform environment ─────
      // The WKWebView appends "Nativite/<platform>/1.0" to its User-Agent via
      // WKWebViewConfiguration.applicationNameForUserAgent (set in the Swift
      // template). The platform token identifies both that the request is from a
      // native WebView AND which named Vite environment should serve its modules.
      server.middlewares.use(async (req, res, next) => {
        const ua = req.headers["user-agent"];
        const uaStr = Array.isArray(ua) ? ua.join(" ") : (ua ?? "");
        // Extract platform name from "Nativite/<platform>/1.0" UA token.
        const match = uaStr.match(/Nativite\/([a-z]+)\//);
        if (!match) return next();

        const platformEnv = server.environments[match[1]!];
        if (!platformEnv) return next(); // Unknown or unregistered platform.

        const url = req.url ?? "/";
        // Native WebViews send the same UA on all requests. Only module-like
        // requests should be routed through transformRequest; direct asset URLs
        // must pass through to Vite's static file handlers.
        if (!shouldTransformNativeRequest(url, req.headers)) return next();

        try {
          const result = await platformEnv.transformRequest(url);
          if (result == null) return next();

          // Honour etag-based caching so the WKWebView skips unchanged modules.
          if (result.etag && req.headers["if-none-match"] === result.etag) {
            res.statusCode = 304;
            res.end();
            return;
          }

          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          if (result.etag) res.setHeader("ETag", result.etag);
          res.end(result.code);
        } catch (err) {
          next(err);
        }
      });

      server.httpServer?.once("listening", async () => {
        const launchPlatform = process.env["NATIVITE_PLATFORM"] as Platform | undefined;
        const launchConfig = launchPlatform
          ? resolveConfigForPlatform(config, launchPlatform)
          : config;

        // CLI flags (NATIVITE_TARGET / NATIVITE_SIMULATOR env vars) override
        // the config file values, allowing `nativite dev --simulator "iPhone 15"`
        // to work without editing nativite.config.ts. Per-platform iOS dev
        // options from platforms: [ios({ ... })] are normalized into config.dev.
        const target =
          (process.env["NATIVITE_TARGET"] as "simulator" | "device" | undefined) ??
          launchConfig.dev?.target ??
          "simulator";
        const simulatorName =
          process.env["NATIVITE_SIMULATOR"] ?? launchConfig.dev?.simulator ?? "iPhone 16 Pro";

        let devUrl: string;
        if (target === "device") {
          const ip = getLanIp() ?? "localhost";
          const networkUrl = server.resolvedUrls?.network[0];
          devUrl = networkUrl ?? `http://${ip}:5173`;
        } else {
          const localUrl = server.resolvedUrls?.local[0];
          devUrl = localUrl ?? "http://localhost:5173";
        }

        mkdirSync(nativiteDir, { recursive: true });
        writeFileSync(join(nativiteDir, "dev.json"), JSON.stringify({ devURL: devUrl }, null, 2));

        for (const runtime of configuredPlatformRuntimes) {
          if (typeof runtime.plugin.dev !== "function") continue;
          if (launchPlatform && runtime.id !== launchPlatform) continue;
          const runtimeConfig = resolveConfigForPlatform(config, runtime.id);
          await runtime.plugin.dev({
            rootConfig: config,
            config: runtimeConfig,
            projectRoot: viteConfig.root,
            platform: runtime.config,
            logger: viteConfig.logger,
            devUrl,
            launchTarget: target,
            simulatorName,
          });
        }
      });

      if (viteConfig.configFile) {
        watchFile(viteConfig.configFile, { interval: 1000 }, async () => {
          try {
            // Reload from disk — `config` holds the startup value and would
            // always match the stored hash, so changes would never be detected.
            const freshConfig = await loadNativiteConfigFromDir(viteConfig.root);
            configuredPlatformRuntimes = resolveConfiguredPlatformRuntimes(freshConfig);
            configuredNativeEnvironmentNames = new Set(
              configuredPlatformRuntimes.flatMap((runtime) => runtime.environments),
            );
            nativeVariantSuffixes = new Set(
              configuredPlatformRuntimes.flatMap((runtime) => runtime.extensions).concat(".native"),
            );

            for (const runtime of configuredPlatformRuntimes) {
              if (typeof runtime.plugin.generate !== "function") continue;
              const runtimeConfig = resolveConfigForPlatform(freshConfig, runtime.id);
              await runtime.plugin.generate({
                rootConfig: freshConfig,
                config: runtimeConfig,
                projectRoot: viteConfig.root,
                platform: runtime.config,
                logger: viteConfig.logger,
                force: false,
                mode: "dev",
              });
            }

            config = freshConfig;
          } catch (err) {
            viteConfig.logger.error(
              `[nativite] Failed to reload config: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        });
      }
    },

    // ── HMR ───────────────────────────────────────────────────────────────
    // Native environments use an internal hot channel (not browser WebSocket),
    // so bridge native-variant updates into the client channel as `update`
    // payloads instead of forcing page reloads.
    hotUpdate(options: HotUpdateOptions) {
      if (!isNativeVariantFile(options.file, nativeVariantSuffixes)) return [];

      const seenUpdates = new Set<string>();
      const updates = options.modules
        .filter((mod) => mod.type === "js" || mod.type === "css")
        .flatMap((mod) => {
          const urls = [mod.url];
          const canonicalUrl = canonicalizeNativeVariantUrl(mod.url, nativeVariantSuffixes);
          if (canonicalUrl && canonicalUrl !== mod.url) {
            urls.push(canonicalUrl);
          }

          return urls
            .filter((url) => {
              const key = `${mod.type}:${url}`;
              if (seenUpdates.has(key)) return false;
              seenUpdates.add(key);
              return true;
            })
            .map((url) => ({
              type: `${mod.type}-update` as "js-update" | "css-update",
              path: url,
              acceptedPath: url,
              timestamp: options.timestamp,
              firstInvalidatedBy: options.file,
            }));
        });

      if (updates.length > 0) {
        const signature = updates.map((update) => `${update.type}:${update.path}`).join("|");
        const token = `${options.type}:${options.timestamp}:${options.file}:${signature}`;
        if (lastNativeVariantClientUpdateToken !== token) {
          lastNativeVariantClientUpdateToken = token;
          options.server.environments.client?.hot.send({
            type: "update",
            updates,
          });
        }
      }

      return [];
    },

    // ── Scope side-effects to native platform environments only ───────────
    applyToEnvironment(environment) {
      return configuredNativeEnvironmentNames.has(environment.name);
    },

    async closeBundle(this: { environment?: Environment }) {
      if (!viteConfig) return;

      const distDir = viteConfig.build.outDir;
      if (!existsSync(distDir)) return;

      const assets = collectAssets(distDir, distDir).sort();
      const hash = createHash("sha256").update(assets.join("\n")).digest("hex");
      const manifestPlatform =
        buildPlatform ?? toBundlePlatform(this.environment?.name, platformMetadata);
      if (!manifestPlatform) return;
      const targetPlatform = process.env["NATIVITE_PLATFORM"];
      const targetConfig = targetPlatform
        ? resolveConfigForPlatform(config, targetPlatform)
        : config;

      const manifest: BuildManifest = {
        platform: manifestPlatform,
        version: targetConfig.app.version,
        hash,
        assets,
        builtAt: new Date().toISOString(),
      };

      writeFileSync(join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2));

      const targetRuntime =
        targetPlatform !== undefined
          ? configuredPlatformRuntimes.find((runtime) => runtime.id === targetPlatform)
          : undefined;

      if (targetRuntime && typeof targetRuntime.plugin.build === "function") {
        const runtimeConfig = resolveConfigForPlatform(config, targetRuntime.id);
        await targetRuntime.plugin.build({
          rootConfig: config,
          config: runtimeConfig,
          projectRoot: viteConfig.root,
          platform: targetRuntime.config,
          logger: viteConfig.logger,
          outDir: distDir,
          manifest,
        });
      }
    },
  } satisfies Plugin;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The Nativite Vite plugin.
 *
 * Reads your project's `nativite.config.ts` automatically — no arguments needed.
 *
 * Returns an array of focused sub-plugins that Vite flattens automatically:
 * - `nativite:platform-extensions` — resolves .ios.tsx / .native.tsx variants
 * - `nativite` — core dev server, build pipeline, iOS project generation
 *
 * @example
 * // vite.config.ts
 * import { nativite } from 'nativite/vite'
 * export default defineConfig({ plugins: [react(), nativite()] })
 */
export function nativite(): Plugin[] {
  return [
    // Sub-plugin 1: platform file extension resolution, scoped per environment.
    //
    // Named native environments ("ios", "ipad", "macos") are statically bound
    // to their platform — the env name IS the platform.
    //
    // "client" is handled separately because it serves two distinct roles:
    //   • In dev: serves web browsers → always uses "web" extensions.
    //   • In native builds (NATIVITE_PLATFORM set): its Rollup output is what
    //     the native app embeds in the .app bundle and loads in production.
    //     It must therefore resolve the target platform's extensions, not web.
    //
    //   "ios"    → .ios, .mobile, .native variants
    //   "ipad"   → .ipad, .ios, .mobile, .native variants
    //   "macos"  → .macos, .desktop, .native variants
    //   "client" → NATIVITE_PLATFORM extensions in native builds, else .web
    //   anything else → skipped (Vite resolves normally)
    (() => {
      // One cached platformExtensionsPlugin per platform, constructed lazily.
      const pluginCache = new Map<string, Plugin>();
      function getPlugin(platform: string, suffixes?: string[]): Plugin {
        const cacheKey = `${platform}::${(suffixes ?? []).join(",")}`;
        let p = pluginCache.get(cacheKey);
        if (!p) {
          p = platformExtensionsPlugin(platform, suffixes);
          pluginCache.set(cacheKey, p);
        }
        return p;
      }

      function environmentPlatformMap(): Map<string, string> {
        const map = new Map<string, string>([
          ["ios", "ios"],
          ["ipad", "ios"],
          ["macos", "macos"],
        ]);
        const metadata = runtimeMetadataFromEnv();
        for (const [platform, entry] of Object.entries(metadata)) {
          for (const environment of entry.environments) {
            map.set(environment, platform);
          }
          map.set(platform, platform);
        }
        return map;
      }

      return {
        name: "nativite:platform-extensions",
        enforce: "pre",

        resolveId(source, importer) {
          const env = (
            this as {
              environment?: { name: string; config?: { command?: string } };
            }
          ).environment;
          if (!env) return null;

          let platform: string;
          const metadata = runtimeMetadataFromEnv();

          if (env.name === "client") {
            // "client" serves two distinct roles depending on the Vite command:
            //
            //   build → its Rollup output is what the native app embeds in the
            //           .app bundle and loads in production. Resolve the target
            //           platform's extensions so native code is included.
            //
            //   serve → serves web browsers over HTTP in the dev server.
            //           WKWebViews in dev are already routed to their named
            //           platform environment via UA-based middleware — "client"
            //           must stay on "web" so browsers don't receive native code.
            const target = process.env["NATIVITE_PLATFORM"];
            platform =
              env.config?.command === "build" && target && target !== "web" ? target : "web";
          } else {
            const p = environmentPlatformMap().get(env.name);
            if (!p) return null;
            platform = p;
          }

          const suffixes = metadata[platform]?.extensions;

          return (
            getPlugin(platform, suffixes).resolveId as (
              source: string,
              importer: string | undefined,
            ) => string | null | undefined
          )(source, importer);
        },
      } satisfies Plugin;
    })(),

    // Sub-plugin 2: core Nativite plugin
    nativiteCorePlugin(),
  ];
}
