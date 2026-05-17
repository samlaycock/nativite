import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import type { NativiteConfig } from "../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../platforms/registry.ts";

import { resolveConfiguredPlatformRuntimes } from "../platforms/registry.ts";
import { loadConfig } from "./config.ts";
import { createNativiteLogger, type NativiteLogger } from "./logger.ts";

export interface TestCommandOptions {
  readonly platform?: string;
  readonly device?: string;
  readonly watch?: boolean;
  readonly testUrl?: string;
  readonly coordinatorPort?: string;
  readonly artifactsDir?: string;
  readonly timeout?: string;
}

export interface TestCommandDependencies {
  readonly cwd: () => string;
  readonly platform: () => NodeJS.Platform;
  readonly loadConfig: (cwd: string) => Promise<NativiteConfig>;
  readonly resolveConfiguredPlatformRuntimes: (
    config: NativiteConfig,
    projectRoot?: string,
  ) => ResolvedNativitePlatformRuntime[];
  readonly commandExists: (command: string) => boolean;
  readonly writeFile: (path: string, contents: string) => void;
  readonly spawnVitest: (
    cwd: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
  ) => Promise<number>;
  readonly createLogger: (tag: string) => NativiteLogger;
}

export interface TestProviderConfig {
  readonly platform: string;
  readonly device?: string;
  readonly testUrl: string;
  readonly coordinator: {
    readonly host: string;
    readonly port: number;
    readonly endpoint: string;
  };
  readonly artifactsDir: string;
  readonly launchTimeoutMs: number;
  readonly watch: boolean;
}

const DEFAULT_TEST_URL = "http://127.0.0.1:5173/__nativite_test__";
const DEFAULT_COORDINATOR_PORT = 17321;
const DEFAULT_LAUNCH_TIMEOUT_MS = 60_000;

function commandExists(command: string): boolean {
  const result = spawnSync("which", [command], {
    stdio: "ignore",
  });
  return result.status === 0;
}

async function spawnVitest(
  cwd: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const child = spawn("bunx", args, {
    cwd,
    env,
    stdio: "inherit",
  });

  return await new Promise((resolve) => {
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
    child.on("error", () => {
      resolve(1);
    });
  });
}

const DEFAULT_TEST_COMMAND_DEPS: TestCommandDependencies = {
  cwd: () => process.cwd(),
  platform: () => process.platform,
  loadConfig,
  resolveConfiguredPlatformRuntimes,
  commandExists,
  writeFile: writeFileSync,
  spawnVitest,
  createLogger: createNativiteLogger,
};

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parsePositiveInteger(raw: string | undefined, fallback: number, label: string): number {
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function resolveTestRuntime(
  runtimes: readonly ResolvedNativitePlatformRuntime[],
  requestedPlatform: string | undefined,
  logger: NativiteLogger,
): ResolvedNativitePlatformRuntime | undefined {
  if (!requestedPlatform) {
    logger.error("Missing required --platform option. Use --platform ios or --platform android.");
    return undefined;
  }

  if (requestedPlatform !== "ios" && requestedPlatform !== "android") {
    logger.error('`nativite test` currently supports only "ios" and "android".');
    return undefined;
  }

  const runtime = runtimes.find((entry) => entry.id === requestedPlatform);
  if (runtime) return runtime;

  const configuredPlatforms = runtimes.map((entry) => entry.id).join(", ");
  logger.error(
    `Platform "${requestedPlatform}" is not configured. Configured platforms: ${configuredPlatforms || "(none)"}.`,
  );
  return undefined;
}

function validateNativeTooling(
  runtime: ResolvedNativitePlatformRuntime,
  deps: TestCommandDependencies,
  logger: NativiteLogger,
): boolean {
  if (runtime.id === "ios") {
    if (deps.platform() !== "darwin") {
      logger.error("iOS native tests require macOS with Xcode installed.");
      return false;
    }
    if (!deps.commandExists("xcodebuild")) {
      logger.error(
        "iOS native tests require xcodebuild. Install Xcode or Xcode Command Line Tools.",
      );
      return false;
    }
    if (!deps.commandExists("xcrun")) {
      logger.error("iOS native tests require xcrun. Install Xcode or Xcode Command Line Tools.");
      return false;
    }
  }

  if (runtime.id === "android") {
    if (!deps.commandExists("adb")) {
      logger.error("Android native tests require adb on PATH. Install Android SDK platform-tools.");
      return false;
    }
  }

  return true;
}

function nativeProjectPath(
  config: NativiteConfig,
  runtime: ResolvedNativitePlatformRuntime,
): string {
  if (runtime.id === "ios") return join(".nativite", "ios", `${config.app.name}.xcodeproj`);
  return join(".nativite", "android");
}

export function createTestProviderConfig(options: {
  readonly platform: string;
  readonly device?: string;
  readonly watch: boolean;
  readonly testUrl?: string;
  readonly coordinatorPort?: string;
  readonly artifactsDir?: string;
  readonly timeout?: string;
}): TestProviderConfig {
  const port = parsePositiveInteger(
    options.coordinatorPort,
    DEFAULT_COORDINATOR_PORT,
    "--coordinator-port",
  );
  const launchTimeoutMs = parsePositiveInteger(
    options.timeout,
    DEFAULT_LAUNCH_TIMEOUT_MS,
    "--timeout",
  );

  return {
    platform: options.platform,
    device: options.device,
    testUrl: options.testUrl ?? DEFAULT_TEST_URL,
    coordinator: {
      host: "127.0.0.1",
      port,
      endpoint: `http://127.0.0.1:${port}/harness`,
    },
    artifactsDir: options.artifactsDir ?? ".nativite/test-artifacts",
    launchTimeoutMs,
    watch: options.watch,
  };
}

function serializeProviderConfig(config: TestProviderConfig): string {
  return JSON.stringify(config, null, 2);
}

function toImportSpecifier(fromDir: string, targetPath: string): string {
  const specifier = relative(fromDir, targetPath).replaceAll("\\", "/");
  if (specifier.startsWith(".")) return specifier;
  return `./${specifier}`;
}

export function createGeneratedVitestConfig(
  config: TestProviderConfig,
  userConfigSpecifier = "../../vitest.config",
): string {
  const serializedConfig = serializeProviderConfig(config);

  return `import { mergeConfig } from "vitest/config";
import userConfig from "${userConfigSpecifier}";

const nativiteProviderOptions = ${serializedConfig} as const;

export default mergeConfig(userConfig, {
  test: {
    browser: {
      enabled: true,
      provider: "nativite",
      providerOptions: {
        nativite: nativiteProviderOptions,
      },
    },
  },
});
`;
}

function writeGeneratedVitestConfig(
  cwd: string,
  config: TestProviderConfig,
  userConfigPath: string,
  deps: TestCommandDependencies,
): string {
  const outputDir = join(cwd, ".nativite", "test");
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, "vitest.nativite.generated.mts");
  const userConfigSpecifier = toImportSpecifier(outputDir, userConfigPath);
  deps.writeFile(outputPath, createGeneratedVitestConfig(config, userConfigSpecifier));
  return outputPath;
}

function createVitestArgs(configPath: string, watch: boolean): readonly string[] {
  const args = ["vitest", "--config", configPath, "--browser.enabled"] as string[];
  if (!watch) args.push("--run");
  return args;
}

function resolveVitestConfigPath(cwd: string): string | undefined {
  const configPath = join(cwd, "vitest.config.ts");
  if (existsSync(configPath)) return configPath;

  const mtsConfigPath = join(cwd, "vitest.config.mts");
  if (existsSync(mtsConfigPath)) return mtsConfigPath;

  return undefined;
}

export async function runTestCommand(
  options: TestCommandOptions,
  deps: TestCommandDependencies = DEFAULT_TEST_COMMAND_DEPS,
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

  const runtime = resolveTestRuntime(runtimes, options.platform, logger);
  if (!runtime) return 1;
  if (!validateNativeTooling(runtime, deps, logger)) return 1;

  const userVitestConfigPath = resolveVitestConfigPath(cwd);
  if (!userVitestConfigPath) {
    logger.error(
      "Could not find vitest.config.ts or vitest.config.mts. Create one before running native tests.",
    );
    return 1;
  }

  let providerConfig: TestProviderConfig;
  try {
    providerConfig = createTestProviderConfig({
      platform: runtime.id,
      device: options.device,
      watch: options.watch ?? false,
      testUrl: options.testUrl,
      coordinatorPort: options.coordinatorPort,
      artifactsDir: options.artifactsDir,
      timeout: options.timeout,
    });
  } catch (err) {
    logger.error(toErrorMessage(err));
    return 1;
  }

  let generatedConfigPath: string;
  try {
    generatedConfigPath = writeGeneratedVitestConfig(
      cwd,
      providerConfig,
      userVitestConfigPath,
      deps,
    );
  } catch (err) {
    logger.error(`Could not write generated Vitest config: ${toErrorMessage(err)}`);
    return 1;
  }
  const args = createVitestArgs(generatedConfigPath, providerConfig.watch);
  const coordinatorEnv = serializeProviderConfig(providerConfig);
  const testEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NATIVITE_TEST_PLATFORM: runtime.id,
    NATIVITE_TEST_URL: providerConfig.testUrl,
    NATIVITE_COORDINATOR_URL: providerConfig.coordinator.endpoint,
    NATIVITE_TEST_ARTIFACTS_DIR: providerConfig.artifactsDir,
    NATIVITE_TEST_PROVIDER_OPTIONS: coordinatorEnv,
  };

  if (options.device) testEnv["NATIVITE_TEST_DEVICE"] = options.device;

  logger.info(`Native test platform: ${runtime.id}`);
  logger.info(`Native project: ${nativeProjectPath(config, runtime)}`);
  logger.info(`Coordinator endpoint: ${providerConfig.coordinator.endpoint}`);
  logger.info(`Vitest config: ${generatedConfigPath}`);

  const exitCode = await deps.spawnVitest(cwd, args, testEnv);

  if (exitCode !== 0) logger.error(`Vitest exited with code ${exitCode}.`);
  return exitCode;
}
