import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

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
    projectRoot?: string,
  ) => ResolvedNativitePlatformRuntime[];
  readonly serializePlatformRuntimeMetadata: (
    runtimes: ResolvedNativitePlatformRuntime[],
  ) => string;
  readonly loadViteApi: () => Promise<ViteApi>;
  readonly createLogger: (tag: string) => NativiteLogger;
  readonly exists: (path: string) => boolean;
  readonly readFile: (path: string) => string;
  readonly remove: (path: string) => void;
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
  exists: existsSync,
  readFile: (path) => readFileSync(path, "utf-8"),
  remove: (path) => rmSync(path, { force: true }),
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

function defaultBundlePath(runtime: ResolvedNativitePlatformRuntime): string {
  return `dist-${runtime.bundlePlatform}`;
}

function pluginBuildMarkerPath(runtime: ResolvedNativitePlatformRuntime): string {
  return join(".nativite", "build", `${runtime.id}.json`);
}

function nativeProjectPath(
  config: NativiteConfig,
  runtime: ResolvedNativitePlatformRuntime,
): string {
  if (runtime.id === "ios" || runtime.id === "macos") {
    return join(".nativite", runtime.id, `${config.app.name}.xcodeproj`);
  }

  return join(".nativite", runtime.id);
}

function platformDisplayName(runtime: ResolvedNativitePlatformRuntime): string {
  if (runtime.id === "ios") return "iOS";
  if (runtime.id === "macos") return "macOS";
  if (runtime.id === "android") return "Android";

  return runtime.id;
}

function buildNextStepsSummary(
  config: NativiteConfig,
  runtimes: ReadonlyArray<ResolvedNativitePlatformRuntime>,
): string {
  const steps = runtimes.map((runtime) => {
    return `  ${platformDisplayName(runtime)}: open ${nativeProjectPath(config, runtime)}`;
  });

  return ["Next steps:", ...steps].join("\n");
}

function resolveProjectPath(projectRoot: string, path: string): string {
  return join(projectRoot, path);
}

interface PluginBuildMarker {
  readonly manifestPath: string;
  readonly nativeProjectPath: string;
}

function readPluginBuildMarker(
  projectRoot: string,
  markerPath: string,
  deps: Pick<BuildCommandDependencies, "readFile">,
): PluginBuildMarker | undefined {
  try {
    const parsed = JSON.parse(deps.readFile(resolveProjectPath(projectRoot, markerPath))) as {
      readonly manifestPath?: unknown;
      readonly nativeProjectPath?: unknown;
    };
    if (typeof parsed.manifestPath !== "string") return undefined;
    if (typeof parsed.nativeProjectPath !== "string") return undefined;
    return {
      manifestPath: parsed.manifestPath,
      nativeProjectPath: parsed.nativeProjectPath,
    };
  } catch {
    return undefined;
  }
}

function validatePlatformBuildOutputs(
  projectRoot: string,
  config: NativiteConfig,
  runtime: ResolvedNativitePlatformRuntime,
  deps: Pick<BuildCommandDependencies, "exists" | "readFile">,
): string | undefined {
  const markerPath = pluginBuildMarkerPath(runtime);
  if (!deps.exists(resolveProjectPath(projectRoot, markerPath))) {
    return [
      `The Nativite Vite plugin did not complete for ${runtime.id}.`,
      'Add `nativite()` to your Vite config "plugins" array.',
      'Example: import { nativite } from "nativite/vite"; export default defineConfig({ plugins: [nativite()] });',
    ].join(" ");
  }

  const marker = readPluginBuildMarker(projectRoot, markerPath, deps);
  if (!marker) {
    return `The Nativite Vite plugin completion marker is invalid for ${runtime.id}: ${markerPath}`;
  }

  const manifestPath = marker.manifestPath;
  if (!deps.exists(resolveProjectPath(projectRoot, manifestPath))) {
    return `Expected web bundle manifest was not generated for ${runtime.id}: ${manifestPath}`;
  }

  const projectPath = marker.nativeProjectPath || nativeProjectPath(config, runtime);
  if (!deps.exists(resolveProjectPath(projectRoot, projectPath))) {
    return `Expected native project output was not generated for ${runtime.id}: ${projectPath}`;
  }

  return undefined;
}

export async function runBuildCommand(
  options: BuildCommandOptions,
  deps: Partial<BuildCommandDependencies> = DEFAULT_BUILD_COMMAND_DEPS,
): Promise<number> {
  const commandDeps: BuildCommandDependencies = {
    ...DEFAULT_BUILD_COMMAND_DEPS,
    ...deps,
  };
  const logger = commandDeps.createLogger("nativite");
  const projectRoot = commandDeps.cwd();

  let config: NativiteConfig;
  try {
    config = await commandDeps.loadConfig(projectRoot);
  } catch (err) {
    logger.error(toErrorMessage(err));
    return 1;
  }

  let runtimes: ResolvedNativitePlatformRuntime[];
  try {
    runtimes = commandDeps.resolveConfiguredPlatformRuntimes(config, projectRoot);
  } catch (err) {
    logger.error(toErrorMessage(err));
    return 1;
  }

  const targetRuntimes = resolveTargetRuntimes(runtimes, options.platform, logger);
  if (!targetRuntimes) return 1;

  let vite: ViteApi;
  try {
    vite = await commandDeps.loadViteApi();
  } catch {
    logger.error("Could not import vite. Make sure vite is installed in your project.");
    return 1;
  }

  process.env["NATIVITE_PLATFORMS"] = runtimes.map((runtime) => runtime.id).join(",");
  process.env["NATIVITE_PLATFORM_METADATA"] =
    commandDeps.serializePlatformRuntimeMetadata(runtimes);

  for (const runtime of targetRuntimes) {
    process.env["NATIVITE_PLATFORM"] = runtime.id;
    commandDeps.remove(resolveProjectPath(projectRoot, pluginBuildMarkerPath(runtime)));

    logger.info(`Building ${runtime.id} for production...`);

    try {
      await vite.build({ mode: "production" });
    } catch (err) {
      logger.error(`Build failed for ${runtime.id}: ${toErrorMessage(err)}`);
      return 1;
    }

    const validationError = validatePlatformBuildOutputs(projectRoot, config, runtime, commandDeps);
    if (validationError) {
      logger.error(validationError);
      return 1;
    }

    logger.info(`Native project: ${nativeProjectPath(config, runtime)}`);
    logger.info(`Web bundle: ${defaultBundlePath(runtime)}`);
  }

  const platformList = targetRuntimes.map((runtime) => runtime.id).join(", ");
  logger.info(
    `Production build${targetRuntimes.length === 1 ? "" : "s"} complete for: ${platformList}`,
  );
  logger.info(buildNextStepsSummary(config, targetRuntimes));

  return 0;
}
