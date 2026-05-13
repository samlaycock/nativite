import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

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
export const BACKGROUND_ASSET_DIRECTORY = "nativite-background";

const backgroundRuntimeModuleId = "\0nativite-background-runtime";
const moduleDir = dirname(fileURLToPath(import.meta.url));
const backgroundRuntimeImportIds = new Set([
  "nativite/background",
  resolve(moduleDir, "..", "background.ts"),
  pathToFileURL(resolve(moduleDir, "..", "background.ts")).href,
  resolve(moduleDir, "background.mjs"),
  pathToFileURL(resolve(moduleDir, "background.mjs")).href,
]);

export type ResolvedBackgroundTaskEntry = {
  readonly registeredPath: string;
  readonly absolutePath: string;
  readonly manifestEntry: BackgroundTaskManifestEntry;
};

export type BackgroundTaskBundle = {
  readonly bundle: string;
  readonly code: string;
};

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

function isBackgroundRuntimeImport(id: string): boolean {
  return backgroundRuntimeImportIds.has(id);
}

export async function resolveBackgroundTaskEntries(
  config: NativiteConfig,
  cwd: string,
): Promise<ResolvedBackgroundTaskEntry[]> {
  const entries: ResolvedBackgroundTaskEntry[] = [];
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
    entries.push({
      registeredPath,
      absolutePath,
      manifestEntry: createBackgroundTaskManifestEntry(module.default, bundle),
    });
  }

  entries.sort((a, b) => a.manifestEntry.id.localeCompare(b.manifestEntry.id));
  return entries;
}

export async function resolveBackgroundTaskManifest(
  config: NativiteConfig,
  cwd: string,
): Promise<BackgroundTaskManifest> {
  const entries = await resolveBackgroundTaskEntries(config, cwd);
  return createBackgroundTaskManifestFromEntries(entries);
}

export function createBackgroundTaskManifestFromEntries(
  entries: readonly ResolvedBackgroundTaskEntry[],
): BackgroundTaskManifest {
  return createBackgroundTaskManifest(entries.map((entry) => entry.manifestEntry));
}

export function backgroundTaskHashInputs(
  bundles: readonly BackgroundTaskBundle[],
): { readonly name: string; readonly content: string }[] {
  return bundles.map((bundle) => ({
    name: `background-task-bundle:${bundle.bundle}`,
    content: bundle.code,
  }));
}

export async function buildBackgroundTaskBundles(
  entries: readonly ResolvedBackgroundTaskEntry[],
  cwd: string,
): Promise<BackgroundTaskBundle[]> {
  const bundles: BackgroundTaskBundle[] = [];
  for (const entry of entries) {
    const bundle = entry.manifestEntry.bundle;
    const result = await build({
      configFile: false,
      envFile: false,
      logLevel: "silent",
      plugins: [
        {
          name: "nativite-background-runtime",
          enforce: "pre",
          resolveId(id) {
            return isBackgroundRuntimeImport(id) ? backgroundRuntimeModuleId : undefined;
          },
          load(id) {
            if (id !== backgroundRuntimeModuleId) return undefined;
            return "export function defineBackgroundTask(task) { return task; }\n";
          },
        },
      ],
      root: cwd,
      build: {
        emptyOutDir: false,
        lib: {
          entry: entry.absolutePath,
          fileName: () => bundle,
          formats: ["es"],
        },
        minify: false,
        outDir: BACKGROUND_ASSET_DIRECTORY,
        sourcemap: false,
        target: "es2022",
        write: false,
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      },
    });

    const rollupOutputs = (Array.isArray(result) ? result : [result]) as {
      readonly output: readonly (
        | { readonly type: "asset" }
        | { readonly type: "chunk"; readonly code: string }
      )[];
    }[];
    const outputs = rollupOutputs.flatMap((output) => output.output);
    const chunks = outputs.filter((output) => output.type === "chunk");
    const assets = outputs.filter((output) => output.type === "asset");

    if (chunks.length !== 1 || assets.length > 0) {
      throw new Error(
        `Background task ${entry.registeredPath} must bundle to exactly one JavaScript file.`,
      );
    }
    const [chunk] = chunks;
    if (!chunk) {
      throw new Error(`Background task ${entry.registeredPath} did not emit a JavaScript bundle.`);
    }

    bundles.push({
      bundle,
      code: chunk.code,
    });
  }

  return bundles;
}

export function writeBackgroundTaskBundles(
  bundles: readonly BackgroundTaskBundle[],
  outputRoot: string,
): string[] {
  const outputDir = join(outputRoot, BACKGROUND_ASSET_DIRECTORY);
  mkdirSync(outputDir, { recursive: true });

  return bundles.map((bundle) => {
    const outputPath = join(outputDir, bundle.bundle);
    writeFileSync(outputPath, bundle.code);
    return outputPath;
  });
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
