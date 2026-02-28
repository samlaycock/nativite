#!/usr/bin/env node

import type { Logger } from "vite";

import { Command } from "commander";
import { createRequire } from "node:module";
import { join } from "node:path";

import { NativiteConfigSchema, type NativiteConfig } from "../index.ts";
import {
  resolveConfigForPlatform,
  resolveConfiguredPlatformRuntimes,
  serializePlatformRuntimeMetadata,
} from "../platforms/registry.ts";
import { createNativiteLogger, printBanner, printServerUrls } from "./logger.ts";
import { createNativiteShortcuts } from "./shortcuts.ts";

// Read the version from package.json at runtime so the CLI always reports the
// version that was actually published, with no manual sync required.
const _require = createRequire(import.meta.url);
const { version } = _require("../../package.json") as { version: string };

type ViteApi = {
  createServer(inlineConfig?: Record<string, unknown>): Promise<{
    listen(port?: number): Promise<unknown>;
    printUrls(): void;
    bindCLIShortcuts(options?: {
      print?: boolean;
      customShortcuts?: Array<{
        key: string;
        description: string;
        action?(server: unknown): void | Promise<void>;
      }>;
    }): void;
    close(): Promise<void>;
    config: { root: string; logger: Logger };
    resolvedUrls: { local: string[]; network: string[] } | null;
    openBrowser(): void;
  }>;
  build(inlineConfig?: Record<string, unknown>): Promise<unknown>;
  loadConfigFromFile(
    env: { command: "build" | "serve"; mode: string },
    configFile?: string,
    configRoot?: string,
    logLevel?: string,
    customLogger?: Logger,
  ): Promise<{ config: unknown } | null>;
};

let viteApiPromise: Promise<ViteApi> | undefined;

function loadViteApi(): Promise<ViteApi> {
  viteApiPromise ??= import("vite") as unknown as Promise<ViteApi>;
  return viteApiPromise;
}

function ensureViteOrExit(logger: Logger): Promise<ViteApi> {
  return loadViteApi().catch(() => {
    logger.error("Could not import vite. Make sure vite is installed in your project.");
    process.exit(1);
  });
}

const program = new Command();

program
  .name("nativite")
  .description("Nativite CLI — build native iOS/macOS apps with web technologies")
  .version(version);

function resolveRequestedPlatform(
  optionsPlatform: string | undefined,
  config: NativiteConfig,
  logger: Logger,
): string {
  const runtimes = resolveConfiguredPlatformRuntimes(config);
  const requested = optionsPlatform ?? runtimes[0]?.id;
  if (!requested) {
    logger.error("No platforms are configured.");
    process.exit(1);
  }
  if (!runtimes.some((runtime) => runtime.id === requested)) {
    const configured = runtimes.map((runtime) => runtime.id).join(", ");
    logger.error(
      `Unknown platform "${requested}". Configured platforms: ${configured || "(none)"}.`,
    );
    process.exit(1);
  }
  return requested;
}

function setPlatformEnv(config: NativiteConfig, selectedPlatform: string): void {
  const runtimes = resolveConfiguredPlatformRuntimes(config);
  const platformConfig = resolveConfigForPlatform(config, selectedPlatform);
  const errorOverlay = platformConfig.dev?.errorOverlay === true ? "true" : "false";

  process.env["NATIVITE_PLATFORM"] = selectedPlatform;
  process.env["NATIVITE_PLATFORMS"] = runtimes.map((runtime) => runtime.id).join(",");
  process.env["NATIVITE_PLATFORM_METADATA"] = serializePlatformRuntimeMetadata(runtimes);
  process.env["NATIVITE_DEV_ERROR_OVERLAY"] = errorOverlay;
}

// ─── nativite generate ───────────────────────────────────────────────────────

program
  .command("generate")
  .description("Generate the native project from nativite.config.ts")
  .option("--platform <platform>", "Target platform")
  .option("--force", "Force regeneration even if the config has not changed")
  .action(async (options: { platform?: string; force?: boolean }) => {
    const logger = createNativiteLogger("nativite");
    await ensureViteOrExit(logger);
    const cwd = process.cwd();
    const config = await loadNativiteConfig(cwd, logger);
    const platform = resolveRequestedPlatform(options.platform, config, logger);
    const runtime = resolveConfiguredPlatformRuntimes(config).find(
      (entry) => entry.id === platform,
    );

    if (!runtime) process.exit(1);

    logger.info(`Generating ${platform} project...`);
    if (typeof runtime.plugin.generate !== "function") {
      logger.warn(`Platform "${platform}" has no generate hook. Nothing to generate.`);
    } else {
      const platformConfig = resolveConfigForPlatform(config, platform);
      await runtime.plugin.generate({
        rootConfig: config,
        config: platformConfig,
        projectRoot: cwd,
        platform: runtime.config,
        logger,
        force: options.force ?? false,
        mode: "generate",
      });
    }
  });

// ─── nativite dev ────────────────────────────────────────────────────────────

program
  .command("dev")
  .description("Start Vite dev server and launch on simulator or device")
  .option("--platform <platform>", "Target platform")
  .option("--target <target>", "Launch target: simulator or device")
  .option("--simulator <name>", "Simulator name (overrides nativite.config.ts)")
  .action(async (options: { platform?: string; target?: string; simulator?: string }) => {
    const logger = createNativiteLogger("nativite");
    const vite = await ensureViteOrExit(logger);
    const cwd = process.cwd();
    const config = await loadNativiteConfig(cwd, logger);
    const platform = resolveRequestedPlatform(options.platform, config, logger);
    const runtimes = resolveConfiguredPlatformRuntimes(config);
    const platformConfig = resolveConfigForPlatform(config, platform);

    // Set env vars directly — no subprocess needed.
    setPlatformEnv(config, platform);
    if (options.target !== undefined) process.env["NATIVITE_TARGET"] = options.target;
    if (options.simulator !== undefined) process.env["NATIVITE_SIMULATOR"] = options.simulator;

    const viteLogger = createNativiteLogger("vite");

    let server: Awaited<ReturnType<ViteApi["createServer"]>>;
    try {
      server = await vite.createServer({ customLogger: viteLogger } as Record<string, unknown>);
    } catch (err) {
      logger.error(
        `Failed to create dev server: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }

    // Graceful shutdown
    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await server.listen();

    printBanner(version);
    const simulatorName = options.simulator ?? platformConfig.dev?.simulator ?? "iPhone 16 Pro";
    const launchTarget =
      (options.target as "simulator" | "device" | undefined) ??
      platformConfig.dev?.target ??
      "simulator";
    printServerUrls(server.resolvedUrls, platform, simulatorName);

    const shortcuts = createNativiteShortcuts({
      config,
      platform,
      runtimes,
      simulatorName,
      devUrl: server.resolvedUrls?.local[0] ?? "http://localhost:5173",
      launchTarget,
    });

    server.bindCLIShortcuts({
      print: true,
      customShortcuts: shortcuts,
    });
  });

// ─── nativite build ──────────────────────────────────────────────────────────

program
  .command("build")
  .description("Production build (wraps vite build)")
  .option("--platform <platform>", "Target platform")
  .action(async (options: { platform?: string }) => {
    const logger = createNativiteLogger("nativite");
    const vite = await ensureViteOrExit(logger);
    const cwd = process.cwd();
    const config = await loadNativiteConfig(cwd, logger);
    const platform = resolveRequestedPlatform(options.platform, config, logger);

    setPlatformEnv(config, platform);

    printBanner(version);
    logger.info(`Building for ${platform}...`);

    const viteLogger = createNativiteLogger("build");

    try {
      await vite.build({ customLogger: viteLogger } as Record<string, unknown>);
    } catch (err) {
      logger.error(`Build failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ─── Config loading ───────────────────────────────────────────────────────────

async function loadNativiteConfig(cwd: string, logger: Logger): Promise<NativiteConfig> {
  const configFile = join(cwd, "nativite.config.ts");

  const vite = await loadViteApi();
  const result = await vite.loadConfigFromFile(
    { command: "build", mode: "production" },
    configFile,
    cwd,
    "info",
    logger,
  );

  if (!result) {
    logger.error(
      `Could not load nativite.config.ts from ${cwd}. ` +
        "Make sure the file exists and exports a default config via defineConfig().",
    );
    process.exit(1);
  }

  return NativiteConfigSchema.parse(result.config);
}

program.parse(process.argv);
