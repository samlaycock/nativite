import { join } from "node:path";

import { NativiteConfigSchema, type NativiteConfig } from "../index.ts";

const CONFIG_FILENAME = "nativite.config.ts";

export async function loadConfig(cwd: string): Promise<NativiteConfig> {
  const configPath = join(cwd, CONFIG_FILENAME);

  let configModule: { default?: unknown };
  try {
    configModule = await importConfigModule(configPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not load ${CONFIG_FILENAME} from ${cwd}. ` +
        `Make sure the file exists and exports a default config via defineConfig().\n${message}`,
    );
  }

  const raw = configModule.default;
  if (!raw || typeof raw !== "object") {
    throw new Error(
      `${CONFIG_FILENAME} must export a default config object. ` +
        "Use defineConfig() to create your config.",
    );
  }

  return NativiteConfigSchema.parse(raw);
}

async function importConfigModule(configPath: string): Promise<{ default?: unknown }> {
  try {
    return (await import(configPath)) as { default?: unknown };
  } catch (err) {
    if (!shouldFallbackToViteConfigLoader(err)) throw err;
    return loadConfigModuleWithVite(configPath);
  }
}

function shouldFallbackToViteConfigLoader(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  return (
    err.message.includes("Unknown file extension") ||
    err.message.includes("ERR_UNKNOWN_FILE_EXTENSION") ||
    err.message.includes("Cannot use import statement outside a module")
  );
}

async function loadConfigModuleWithVite(configPath: string): Promise<{ default?: unknown }> {
  const { loadConfigFromFile } = await import("vite");
  const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, configPath);
  if (!loaded) {
    throw new Error(`Vite could not load ${CONFIG_FILENAME}.`);
  }

  return { default: loaded.config };
}
