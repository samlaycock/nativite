#!/usr/bin/env node

import type { LogLevel, Logger } from "vite";

import { Command } from "commander";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

import { NativiteConfigSchema, type NativiteConfig } from "../index.ts";
import { generateProject } from "../ios/index.ts";
import {
  resolveConfigForPlatform,
  resolveConfiguredPlatformRuntimes,
  serializePlatformRuntimeMetadata,
} from "../platforms/registry.ts";

// Read the version from package.json at runtime so the CLI always reports the
// version that was actually published, with no manual sync required.
const _require = createRequire(import.meta.url);
const { version } = _require("../../package.json") as { version: string };

type ViteApi = {
  createLogger(level?: LogLevel, options?: { prefix?: string }): Logger;
  loadConfigFromFile(
    env: { command: "build" | "serve"; mode: string },
    configFile?: string,
    configRoot?: string,
    logLevel?: LogLevel,
    customLogger?: Logger,
  ): Promise<{ config: unknown } | null>;
};

let viteApiPromise: Promise<ViteApi> | undefined;

function loadViteApi(): Promise<ViteApi> {
  viteApiPromise ??= import("vite").then((vite) => ({
    createLogger: vite.createLogger,
    loadConfigFromFile: vite.loadConfigFromFile,
  }));
  return viteApiPromise;
}

async function createNativiteLogger(logLevel: LogLevel = "info"): Promise<Logger> {
  const vite = await loadViteApi();
  return vite.createLogger(logLevel, { prefix: "[nativite]" });
}

async function createNativiteLoggerOrExit(): Promise<Logger> {
  try {
    return await createNativiteLogger();
  } catch {
    console.error("[nativite] Could not import vite. Make sure vite is installed in your project.");
    process.exit(1);
  }
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

function createPlatformEnv(config: NativiteConfig, selectedPlatform: string): NodeJS.ProcessEnv {
  const runtimes = resolveConfiguredPlatformRuntimes(config);
  const platformConfig = resolveConfigForPlatform(config, selectedPlatform);
  const errorOverlay = platformConfig.dev?.errorOverlay === true ? "true" : "false";
  return {
    ...process.env,
    NATIVITE_PLATFORM: selectedPlatform,
    NATIVITE_PLATFORMS: runtimes.map((runtime) => runtime.id).join(","),
    NATIVITE_PLATFORM_METADATA: serializePlatformRuntimeMetadata(runtimes),
    NATIVITE_DEV_ERROR_OVERLAY: errorOverlay,
  };
}

// ─── nativite generate ───────────────────────────────────────────────────────

program
  .command("generate")
  .description("Generate the native project from nativite.config.ts")
  .option("--platform <platform>", "Target platform")
  .option("--force", "Force regeneration even if the config has not changed")
  .action(async (options: { platform?: string; force?: boolean }) => {
    const logger = await createNativiteLoggerOrExit();
    const cwd = process.cwd();
    const config = await loadNativiteConfig(cwd, logger);
    const platform = resolveRequestedPlatform(options.platform, config, logger);
    const runtime = resolveConfiguredPlatformRuntimes(config).find(
      (entry) => entry.id === platform,
    );

    if (!runtime) process.exit(1);

    logger.info(`Generating ${platform} project...`);
    if (runtime.isBuiltIn) {
      const result = await generateProject(config, cwd, options.force ?? false);
      if (result.skipped) {
        logger.info("Project is up to date. Use --force to regenerate.");
      } else {
        logger.info(`Generated: ${result.projectPath}`);
      }
    } else {
      if (typeof runtime.plugin?.generate !== "function") {
        logger.warn(`[nativite] Platform "${platform}" has no generate hook. Nothing to generate.`);
      } else {
        const platformConfig = resolveConfigForPlatform(config, platform);
        await runtime.plugin.generate({
          config: platformConfig,
          projectRoot: cwd,
          platform: runtime.config,
          logger,
          force: options.force ?? false,
        });
      }
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
    const logger = await createNativiteLoggerOrExit();
    const cwd = process.cwd();
    const config = await loadNativiteConfig(cwd, logger);
    const platform = resolveRequestedPlatform(options.platform, config, logger);

    // Only forward --target / --simulator when they were explicitly provided.
    // If omitted, the Vite plugin falls back to nativite.config.ts values
    // (including iOS per-platform dev settings from platforms: [ios({...})]).
    const env = createPlatformEnv(config, platform);
    if (options.target !== undefined) env["NATIVITE_TARGET"] = options.target;
    if (options.simulator !== undefined) env["NATIVITE_SIMULATOR"] = options.simulator;

    const child = spawn("npx", ["vite"], {
      stdio: "inherit",
      env,
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });

// ─── nativite build ──────────────────────────────────────────────────────────

program
  .command("build")
  .description("Production build (wraps vite build)")
  .option("--platform <platform>", "Target platform")
  .action(async (options: { platform?: string }) => {
    const logger = await createNativiteLoggerOrExit();
    const cwd = process.cwd();
    const config = await loadNativiteConfig(cwd, logger);
    const platform = resolveRequestedPlatform(options.platform, config, logger);

    const child = spawn("npx", ["vite", "build"], {
      stdio: "inherit",
      env: createPlatformEnv(config, platform),
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
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
