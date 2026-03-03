import { join } from "node:path";

import { NativiteConfigSchema, type NativiteConfig } from "../index.ts";

const CONFIG_FILENAME = "nativite.config.ts";

export async function loadConfig(cwd: string): Promise<NativiteConfig> {
  const configPath = join(cwd, CONFIG_FILENAME);

  let configModule: { default?: unknown };
  try {
    configModule = (await import(configPath)) as { default?: unknown };
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
