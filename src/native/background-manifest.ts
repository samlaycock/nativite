import { mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BackgroundTaskDefinition,
  BackgroundTaskManifest,
  BackgroundTaskManifestEntry,
} from "../background.ts";
import type { NativiteConfig } from "../index.ts";

import {
  backgroundTaskPath,
  createBackgroundTaskManifest,
  createBackgroundTaskManifestEntry,
} from "../background.ts";

export const BACKGROUND_MANIFEST_RELATIVE_PATH = "nativite-background/manifest.json";

function stableBundleName(taskPath: string): string {
  const filename = basename(taskPath);
  const extension = extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  return `${stem}.js`;
}

function isBackgroundTaskDefinition(value: unknown): value is BackgroundTaskDefinition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { id?: unknown; run?: unknown };
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.run === "function"
  );
}

export async function resolveBackgroundTaskManifest(
  config: NativiteConfig,
  cwd: string,
): Promise<BackgroundTaskManifest> {
  const entries: BackgroundTaskManifestEntry[] = [];
  const taskIds = new Map<string, string>();
  const bundleNames = new Map<string, string>();

  for (const registration of config.backgroundTasks ?? []) {
    const registeredPath = backgroundTaskPath(registration);
    const absolutePath = isAbsolute(registeredPath) ? registeredPath : resolve(cwd, registeredPath);

    let module: { default?: unknown };
    try {
      module = (await import(pathToFileURL(absolutePath).href)) as { default?: unknown };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not load background task module ${registeredPath}.\n${message}`);
    }

    if (!isBackgroundTaskDefinition(module.default)) {
      throw new Error(
        `Background task module ${registeredPath} must default-export a ` +
          "defineBackgroundTask() result with a non-empty string id and run function.",
      );
    }

    const existingPath = taskIds.get(module.default.id);
    if (existingPath) {
      throw new Error(
        `Duplicate background task id "${module.default.id}" in ${existingPath} and ${registeredPath}.`,
      );
    }

    const bundle = stableBundleName(registeredPath);
    const existingBundlePath = bundleNames.get(bundle);
    if (existingBundlePath) {
      throw new Error(
        `Duplicate background task bundle "${bundle}" from ${existingBundlePath} and ` +
          `${registeredPath}. Use unique task filenames so generated bundle names do not collide.`,
      );
    }

    taskIds.set(module.default.id, registeredPath);
    bundleNames.set(bundle, registeredPath);
    entries.push(createBackgroundTaskManifestEntry(module.default, bundle));
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return createBackgroundTaskManifest(entries);
}

export function serializeBackgroundTaskManifest(manifest: BackgroundTaskManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function writeBackgroundTaskManifest(
  manifest: BackgroundTaskManifest,
  outputRoot: string,
): string {
  const outputPath = join(outputRoot, BACKGROUND_MANIFEST_RELATIVE_PATH);
  mkdirSync(join(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, serializeBackgroundTaskManifest(manifest));
  return outputPath;
}
