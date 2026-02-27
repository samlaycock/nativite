import type {
  Environment,
  EnvironmentOptions,
  HotUpdateOptions,
  Plugin,
  ResolvedConfig,
  UserConfig,
} from "vite";

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  watchFile,
  writeFileSync,
} from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

import {
  NativiteConfigSchema,
  type BundlePlatform,
  type BuildManifest,
  type NativiteConfig,
  type NativitePluginMode,
  type Platform,
} from "../index.ts";
import { hashConfigForGeneration } from "../ios/hash.ts";
import { generateProject } from "../ios/index.ts";
import {
  deserializePlatformRuntimeMetadata,
  resolveConfigForPlatform,
  resolveConfiguredPlatformRuntimes,
} from "../platforms/registry.ts";
import { resolveNativitePlugins } from "../plugins/resolve.ts";
import { platformExtensionsPlugin } from "./platform-extensions-plugin.ts";

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

function formatExecSyncError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const execErr = err as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
  const stdout = execErr.stdout ? String(execErr.stdout).trim() : "";
  const stderr = execErr.stderr ? String(execErr.stderr).trim() : "";
  const details = [stderr, stdout].filter(Boolean).join("\n");

  return details ? `${err.message}\n${details}` : err.message;
}

async function isStale(
  config: NativiteConfig,
  nativiteDir: string,
  projectRoot: string,
  mode: NativitePluginMode,
): Promise<boolean> {
  const hashFile = join(nativiteDir, ".hash");
  if (!existsSync(hashFile)) return true;
  const existing = readFileSync(hashFile, "utf-8").trim();
  const resolvedPlugins = await resolveNativitePlugins(config, projectRoot, mode);
  if (existing !== hashConfigForGeneration(config, resolvedPlugins)) return true;

  // Regenerate older cached projects that predate required target platform
  // settings in the pbxproj (fixes xcodebuild destination resolution issues).
  const projectPath = join(nativiteDir, "ios", `${config.app.name}.xcodeproj`, "project.pbxproj");
  if (!existsSync(projectPath)) return true;

  try {
    const pbxproj = readFileSync(projectPath, "utf-8");
    if (!pbxproj.includes('SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";')) {
      return true;
    }
    if (!pbxproj.includes("SDKROOT = iphoneos;")) {
      return true;
    }
    if (!pbxproj.includes("$SRCROOT/../../../dist-ios")) {
      return true;
    }
    if (config.app.platforms.macos && !pbxproj.includes("$SRCROOT/../../../dist-macos")) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
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

// ─── Simulator helpers ────────────────────────────────────────────────────────

async function buildAndLaunchSimulator(
  config: NativiteConfig,
  cwd: string,
  simulatorName: string,
  devUrl: string,
  logger: ResolvedConfig["logger"],
  appIdOverride?: string,
): Promise<void> {
  const appName = config.app.name;
  const appId = appIdOverride ?? config.app.bundleId;
  const projectPath = join(cwd, ".nativite", "ios", `${appName}.xcodeproj`);
  const buildDir = `/tmp/nativite-build-${appId}`;
  const derivedDataPath = `/tmp/nativite-derived-${appId}`;

  try {
    logger.info(`[nativite] Booting simulator: ${simulatorName}`);
    execSync(`xcrun simctl boot "${simulatorName}" 2>/dev/null || true`, {
      stdio: "pipe",
    });

    logger.info("[nativite] Building with xcodebuild (this may take a moment)...");
    execSync(
      [
        "xcodebuild",
        `-project "${projectPath}"`,
        `-scheme "${appName}"`,
        `-configuration Debug`,
        `-destination "platform=iOS Simulator,name=${simulatorName}"`,
        `-derivedDataPath "${derivedDataPath}"`,
        `CONFIGURATION_BUILD_DIR="${buildDir}"`,
        "build",
      ].join(" "),
      { stdio: "pipe", cwd },
    );

    const appPath = `${buildDir}/${appName}.app`;
    logger.info("[nativite] Installing on simulator...");
    execSync(`xcrun simctl install "${simulatorName}" "${appPath}"`, {
      stdio: "pipe",
    });

    logger.info(`[nativite] Launching ${appId}...`);
    execSync(
      `SIMCTL_CHILD_NATIVITE_DEV_URL="${devUrl}" xcrun simctl launch "${simulatorName}" "${appId}"`,
      { stdio: "pipe" },
    );

    logger.info(`[nativite] App launched. WebView loading ${devUrl}`);
  } catch (err) {
    logger.error(`[nativite] Build/launch failed:\n${formatExecSyncError(err)}`);
  }
}

// ─── macOS build helpers ──────────────────────────────────────────────────────

async function buildAndLaunchMacOS(
  config: NativiteConfig,
  cwd: string,
  devUrl: string,
  logger: ResolvedConfig["logger"],
  appIdOverride?: string,
): Promise<void> {
  const appName = config.app.name;
  const appId = appIdOverride ?? config.app.bundleId;
  const projectPath = join(cwd, ".nativite", "ios", `${appName}.xcodeproj`);
  const buildDir = `/tmp/nativite-build-${appId}-macos`;
  const derivedDataPath = `/tmp/nativite-derived-${appId}-macos`;

  try {
    logger.info("[nativite] Building macOS target with xcodebuild...");
    execSync(
      [
        "xcodebuild",
        `-project "${projectPath}"`,
        `-scheme "${appName}-macOS"`,
        `-configuration Debug`,
        `-destination "platform=macOS"`,
        `-derivedDataPath "${derivedDataPath}"`,
        `CONFIGURATION_BUILD_DIR="${buildDir}"`,
        "build",
      ].join(" "),
      { stdio: "pipe", cwd },
    );

    const appPath = `${buildDir}/${appName}.app/Contents/MacOS/${appName}`;
    logger.info(`[nativite] Launching ${appName} (macOS)...`);
    // Launch via the binary directly so environment variables are passed through.
    // Detach the child process so it runs independently.
    const { spawn } = await import("node:child_process");
    const child = spawn(appPath, [], {
      env: { ...process.env, NATIVITE_DEV_URL: devUrl },
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    logger.info(`[nativite] macOS app launched. WebView loading ${devUrl}`);
  } catch (err) {
    logger.error(`[nativite] macOS build/launch failed:\n${formatExecSyncError(err)}`);
  }
}

// ─── Environment options factory ──────────────────────────────────────────────
// The "native" environment is a distinct named Vite environment representing
// the WKWebView runtime. It shares browser semantics with "client" but gets
// platform-specific defines and is targeted by Nativite's own plugin hooks.

function devDefineValue(mode: string): string {
  return JSON.stringify(mode !== "production");
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
  let lastNativeVariantReloadToken: string | undefined;

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
        ...(buildOutDir ? { build: { outDir: buildOutDir } } : {}),
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
        // HTML is environment-agnostic — let Vite's HTML middleware handle it.
        // The <script type="module"> it emits drives all subsequent module
        // fetches, which are what this middleware actually intercepts.
        if (url === "/" || url.endsWith(".html")) return next();

        // Only intercept ES-module fetches — not direct resource fetches (images,
        // fonts, audio, video, etc.). WKWebView sends the same User-Agent on ALL
        // requests, including <img src>, <link>, and @font-face fetches. If we
        // route those through transformRequest we return JS with the wrong
        // Content-Type and the browser rejects the resource.
        //
        // Sec-Fetch-Dest (supported in WebKit / WKWebView since iOS 16.4 /
        // Safari 16.4) tells us the browser's intended destination:
        //   "empty"  → fetch() or dynamic import() — i.e. a module sub-resource
        //   "script" → <script type="module"> or classic <script>
        //   anything else ("image", "font", "style", …) → static resource
        //
        // For older runtimes that don't send Sec-Fetch-Dest we fall back to the
        // Accept header: image/font/audio/video Accept values indicate a resource
        // fetch rather than a module fetch.
        const rawFetchDest = req.headers["sec-fetch-dest"];
        const fetchDest = Array.isArray(rawFetchDest) ? rawFetchDest[0] : rawFetchDest;
        if (fetchDest) {
          if (fetchDest !== "script" && fetchDest !== "empty") return next();
        } else {
          const rawAccept = req.headers["accept"];
          const accept = Array.isArray(rawAccept) ? rawAccept.join(",") : (rawAccept ?? "");
          if (/\bimage\/|\bfont\/|\baudio\/|\bvideo\//.test(accept)) return next();
        }

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

        const hasAppleTargets = Boolean(config.app.platforms.ios || config.app.platforms.macos);
        if (hasAppleTargets) {
          if (await isStale(config, nativiteDir, viteConfig.root, "dev")) {
            viteConfig.logger.info("[nativite] Generating native project...");
            await generateProject(config, viteConfig.root, true, "dev");
          } else {
            viteConfig.logger.info("[nativite] Native project up to date.");
          }
        }

        const launchIos =
          config.app.platforms.ios &&
          (!launchPlatform || launchPlatform === "ios" || launchPlatform === "ipad");
        const launchMacOS =
          config.app.platforms.macos && (!launchPlatform || launchPlatform === "macos");

        if (launchIos) {
          if (process.platform !== "darwin") {
            viteConfig.logger.warn("[nativite] Skipping iOS launch — not running on macOS.");
          } else {
            if (target === "device") {
              // Device deployment is not automated — the user must install the
              // Xcode build on their device manually. The dev URL is written to
              // .nativite/dev.json so the app picks it up on next launch.
              viteConfig.logger.info(
                `[nativite] Device target — open the Xcode project and run on your device. ` +
                  `The app will load ${devUrl}`,
              );
            } else {
              await buildAndLaunchSimulator(
                config,
                viteConfig.root,
                simulatorName,
                devUrl,
                viteConfig.logger,
                resolveConfigForPlatform(config, "ios").app.bundleId,
              );
            }
          }
        }

        if (launchMacOS) {
          if (process.platform !== "darwin") {
            viteConfig.logger.warn("[nativite] Skipping macOS launch — not running on macOS.");
          } else {
            await buildAndLaunchMacOS(
              config,
              viteConfig.root,
              devUrl,
              viteConfig.logger,
              resolveConfigForPlatform(config, "macos").app.bundleId,
            );
          }
        }

        for (const runtime of configuredPlatformRuntimes) {
          if (!runtime.plugin?.dev) continue;
          if (launchPlatform && runtime.id !== launchPlatform) continue;
          const runtimeConfig = resolveConfigForPlatform(config, runtime.id);
          await runtime.plugin.dev({
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
            if (freshConfig.app.platforms.ios || freshConfig.app.platforms.macos) {
              if (await isStale(freshConfig, nativiteDir, viteConfig.root, "dev")) {
                config = freshConfig;
                viteConfig.logger.info("[nativite] Config changed. Regenerating native project...");
                await generateProject(freshConfig, viteConfig.root, true, "dev");
              }
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
    // Suppress HMR for native platform environments. The WKWebView's HMR
    // channel connects to "client" (via the Vite HMR client in the HTML)
    // and cannot receive updates from the named platform environments.
    hotUpdate(options: HotUpdateOptions) {
      // Native-only variants (.ios/.native/etc.) are invisible to the "client"
      // environment's module graph, so normal HMR won't fire there. Bridge
      // them into the client channel by forcing a page reload.
      if (isNativeVariantFile(options.file, nativeVariantSuffixes)) {
        const shouldReload = options.type !== "update" || options.modules.length > 0;
        if (shouldReload) {
          const token = `${options.type}:${options.timestamp}:${options.file}`;
          if (lastNativeVariantReloadToken !== token) {
            lastNativeVariantReloadToken = token;
            options.server.environments.client?.hot.send({
              type: "full-reload",
              path: "*",
              triggeredBy: options.file,
            });
          }
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

      if (targetRuntime?.plugin?.build) {
        const runtimeConfig = resolveConfigForPlatform(config, targetRuntime.id);
        await targetRuntime.plugin.build({
          config: runtimeConfig,
          projectRoot: viteConfig.root,
          platform: targetRuntime.config,
          logger: viteConfig.logger,
          outDir: distDir,
          manifest,
        });
      }

      if (config.app.platforms.ios || config.app.platforms.macos) {
        if (await isStale(config, nativiteDir, viteConfig.root, "build")) {
          await generateProject(config, viteConfig.root, false, "build");
        }
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
