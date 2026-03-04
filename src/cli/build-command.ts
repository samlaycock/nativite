import type { NativiteConfig } from "../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../platforms/registry.ts";

import {
  resolveConfiguredPlatformRuntimes,
  serializePlatformRuntimeMetadata,
} from "../platforms/registry.ts";
import { loadConfig } from "./config.ts";
import { createNativiteLogger, type NativiteLogger } from "./logger.ts";

export type ViteApi = {
  build(inlineConfig?: Record<string, unknown>): Promise<unknown>;
};

export interface BuildCommandOptions {
  readonly platform?: string;
}

export interface BuildCommandDependencies {
  readonly cwd: () => string;
  readonly loadConfig: (cwd: string) => Promise<NativiteConfig>;
  readonly resolveConfiguredPlatformRuntimes: (
    config: NativiteConfig,
  ) => ResolvedNativitePlatformRuntime[];
  readonly serializePlatformRuntimeMetadata: (
    runtimes: ResolvedNativitePlatformRuntime[],
  ) => string;
  readonly loadViteApi: () => Promise<ViteApi>;
  readonly createLogger: (tag: string) => NativiteLogger;
}

let viteApiPromise: Promise<ViteApi> | undefined;

function loadViteApi(): Promise<ViteApi> {
  viteApiPromise ??= import("vite") as unknown as Promise<ViteApi>;
  return viteApiPromise;
}

const DEFAULT_BUILD_COMMAND_DEPS: BuildCommandDependencies = {
  cwd: () => process.cwd(),
  loadConfig,
  resolveConfiguredPlatformRuntimes,
  serializePlatformRuntimeMetadata,
  loadViteApi,
  createLogger: createNativiteLogger,
};

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function resolveTargetRuntimes(
  runtimes: ReadonlyArray<ResolvedNativitePlatformRuntime>,
  requestedPlatform: string | undefined,
  logger: NativiteLogger,
): ReadonlyArray<ResolvedNativitePlatformRuntime> | undefined {
  if (runtimes.length === 0) {
    logger.error("No platforms are configured.");
    return undefined;
  }

  if (!requestedPlatform) return runtimes;

  const runtime = runtimes.find((entry) => entry.id === requestedPlatform);
  if (runtime) return [runtime];

  const configuredPlatforms = runtimes.map((entry) => entry.id).join(", ");
  logger.error(
    `Unknown platform "${requestedPlatform}". Configured platforms: ${configuredPlatforms || "(none)"}.`,
  );
  return undefined;
}

export async function runBuildCommand(
  options: BuildCommandOptions,
  deps: BuildCommandDependencies = DEFAULT_BUILD_COMMAND_DEPS,
): Promise<number> {
  const logger = deps.createLogger("nativite");

  let config: NativiteConfig;
  try {
    config = await deps.loadConfig(deps.cwd());
  } catch (err) {
    logger.error(toErrorMessage(err));
    return 1;
  }

  let runtimes: ResolvedNativitePlatformRuntime[];
  try {
    runtimes = deps.resolveConfiguredPlatformRuntimes(config);
  } catch (err) {
    logger.error(toErrorMessage(err));
    return 1;
  }

  const targetRuntimes = resolveTargetRuntimes(runtimes, options.platform, logger);
  if (!targetRuntimes) return 1;

  let vite: ViteApi;
  try {
    vite = await deps.loadViteApi();
  } catch {
    logger.error("Could not import vite. Make sure vite is installed in your project.");
    return 1;
  }

  process.env["NATIVITE_PLATFORMS"] = runtimes.map((runtime) => runtime.id).join(",");
  process.env["NATIVITE_PLATFORM_METADATA"] = deps.serializePlatformRuntimeMetadata(runtimes);

  for (const runtime of targetRuntimes) {
    process.env["NATIVITE_PLATFORM"] = runtime.id;

    logger.info(`Building ${runtime.id} for production...`);

    try {
      await vite.build({ mode: "production" });
    } catch (err) {
      logger.error(`Build failed for ${runtime.id}: ${toErrorMessage(err)}`);
      return 1;
    }
  }

  const platformList = targetRuntimes.map((runtime) => runtime.id).join(", ");
  logger.info(
    `Production build${targetRuntimes.length === 1 ? "" : "s"} complete for: ${platformList}`,
  );

  return 0;
}
