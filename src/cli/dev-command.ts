import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { NativiteConfig } from "../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../platforms/registry.ts";

import { resolveConfiguredPlatformRuntimes } from "../platforms/registry.ts";
import { loadConfig } from "./config.ts";
import { createNativiteLogger, type NativiteLogger } from "./logger.ts";

export interface DevCommandOptions {
  readonly url?: string;
}

export interface DevCommandDependencies {
  readonly cwd: () => string;
  readonly loadConfig: (cwd: string) => Promise<NativiteConfig>;
  readonly resolveConfiguredPlatformRuntimes: (
    config: NativiteConfig,
    projectRoot?: string,
  ) => ResolvedNativitePlatformRuntime[];
  readonly readDevServerUrl: (cwd: string) => string | undefined;
  readonly checkUrlReachable: (url: string) => Promise<boolean>;
  readonly createLogger: (tag: string) => NativiteLogger;
}

const DEFAULT_DEV_SERVER_URL = "http://localhost:5173";

const DEFAULT_DEV_COMMAND_DEPS: DevCommandDependencies = {
  cwd: () => process.cwd(),
  loadConfig,
  resolveConfiguredPlatformRuntimes,
  readDevServerUrl,
  checkUrlReachable,
  createLogger: createNativiteLogger,
};

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readDevServerUrl(cwd: string): string | undefined {
  const metadataPath = join(cwd, ".nativite", "dev.json");
  if (!existsSync(metadataPath)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, "utf8")) as { devURL?: unknown };
    return typeof parsed.devURL === "string" && parsed.devURL.length > 0
      ? parsed.devURL
      : undefined;
  } catch {
    return undefined;
  }
}

export async function checkUrlReachable(url: string, timeoutMs = 5_000): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    return response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function platformDisplayName(runtime: ResolvedNativitePlatformRuntime): string {
  if (runtime.id === "ios") return "iOS";
  if (runtime.id === "macos") return "macOS";
  if (runtime.id === "android") return "Android";

  return runtime.id;
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

function platformStatusLine(
  config: NativiteConfig,
  runtime: ResolvedNativitePlatformRuntime,
): string {
  const projectPath = nativeProjectPath(config, runtime);
  const environments = runtime.environments.join(", ");
  return `  ${platformDisplayName(runtime)}: configured, project ${projectPath}, environments ${environments}`;
}

function platformNextAction(
  config: NativiteConfig,
  runtime: ResolvedNativitePlatformRuntime,
): string {
  const projectPath = nativeProjectPath(config, runtime);
  if (runtime.id === "android") return `  Android: open ${projectPath} in Android Studio`;
  if (runtime.id === "ios" || runtime.id === "macos") {
    return `  ${platformDisplayName(runtime)}: open ${projectPath} in Xcode`;
  }

  return `  ${platformDisplayName(runtime)}: open ${projectPath} with the platform IDE`;
}

export async function runDevCommand(
  options: DevCommandOptions,
  deps: DevCommandDependencies = DEFAULT_DEV_COMMAND_DEPS,
): Promise<number> {
  const logger = deps.createLogger("nativite");
  const cwd = deps.cwd();

  let config: NativiteConfig;
  try {
    config = await deps.loadConfig(cwd);
  } catch (err) {
    logger.error(toErrorMessage(err));
    return 1;
  }

  let runtimes: ResolvedNativitePlatformRuntime[];
  try {
    runtimes = deps.resolveConfiguredPlatformRuntimes(config, cwd);
  } catch (err) {
    logger.error(toErrorMessage(err));
    return 1;
  }

  if (runtimes.length === 0) {
    logger.error("No platforms are configured.");
    return 1;
  }

  const devServerUrl = options.url ?? deps.readDevServerUrl(cwd) ?? DEFAULT_DEV_SERVER_URL;
  const reachable = await deps.checkUrlReachable(devServerUrl);

  logger.info("Development status");
  logger.info(`Vite dev server: ${devServerUrl} (${reachable ? "reachable" : "not reachable"})`);
  logger.info(
    `Configured platforms:\n${runtimes.map((runtime) => platformStatusLine(config, runtime)).join("\n")}`,
  );
  logger.info("Hotkeys: use the terminal running `bunx vite dev` for Vite shortcuts.");
  logger.info("Run web dev server: bunx vite dev");
  logger.info(
    `Native IDE launch:\n${runtimes.map((runtime) => platformNextAction(config, runtime)).join("\n")}`,
  );

  if (!reachable) {
    logger.warn(
      "The Vite URL is not reachable. Start `bunx vite dev`, then relaunch from the native IDE.",
    );
  }

  return 0;
}
