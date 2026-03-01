import { createHash } from "node:crypto";

import type { NativiteConfig } from "../index.ts";
import type { ResolvedNativitePlugins } from "../plugins/resolve.ts";

export function hashConfig(config: NativiteConfig): string {
  const normalized = {
    ...config,
    plugins: (config.plugins ?? [])
      .map((plugin) => ({ name: plugin.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function hashConfigForGeneration(
  config: NativiteConfig,
  resolvedPlugins: ResolvedNativitePlugins,
): string {
  const normalized = {
    ...config,
    plugins: [...resolvedPlugins.plugins]
      .map((plugin) => ({
        name: plugin.name,
        fingerprint: plugin.fingerprint,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
