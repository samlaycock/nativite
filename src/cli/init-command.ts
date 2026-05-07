import { access, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { createNativiteLogger, type NativiteLogger } from "./logger.ts";

const CONFIG_FILENAME = "nativite.config.ts";
const PACKAGE_FILENAME = "package.json";
const VITE_CONFIG_FILENAMES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
] as const;

export interface InitCommandOptions {
  readonly force?: boolean;
}

export interface InitCommandDependencies {
  readonly cwd: () => string;
  readonly createLogger: () => NativiteLogger;
}

interface PackageJson {
  readonly name?: string;
}

interface ProjectInfo {
  readonly appName: string;
  readonly bundleId: string;
}

interface ViteUpdateResult {
  readonly updated: boolean;
  readonly reason?: string;
}

const defaultDependencies: InitCommandDependencies = {
  cwd: () => process.cwd(),
  createLogger: () => createNativiteLogger("nativite"),
};

export async function runInitCommand(
  options: InitCommandOptions,
  dependencies: InitCommandDependencies = defaultDependencies,
): Promise<number> {
  const projectRoot = dependencies.cwd();
  const logger = dependencies.createLogger();

  try {
    const projectInfo = await readProjectInfo(projectRoot);
    const configPath = join(projectRoot, CONFIG_FILENAME);

    if ((await fileExists(configPath)) && !options.force) {
      logger.warn(`${CONFIG_FILENAME} already exists. Leaving it unchanged.`);
    } else {
      await writeFile(configPath, createNativiteConfig(projectInfo));
      logger.info(`Wrote ${CONFIG_FILENAME}.`);
    }

    const viteConfigPath = await findViteConfig(projectRoot);
    if (!viteConfigPath) {
      printManualViteInstructions(logger, "No vite.config.* file was found.");
      return 0;
    }

    const viteUpdate = await updateViteConfig(viteConfigPath);
    if (viteUpdate.updated) {
      logger.info(`Updated ${basename(viteConfigPath)}.`);
    } else {
      printManualViteInstructions(
        logger,
        viteUpdate.reason ?? "The Vite config could not be edited safely.",
      );
    }

    logger.info("Next step: bunx nativite build");
    return 0;
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

async function readProjectInfo(projectRoot: string): Promise<ProjectInfo> {
  const packagePath = join(projectRoot, PACKAGE_FILENAME);
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as PackageJson;
  const packageName = packageJson.name ?? "nativite-app";
  const appSlug = normalizePackageName(packageName);

  return {
    appName: toPascalCase(appSlug) || "NativiteApp",
    bundleId: `com.example.${appSlug || "nativiteapp"}`,
  };
}

function normalizePackageName(packageName: string): string {
  return packageName
    .replace(/^@[^/]+\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPascalCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function createNativiteConfig(projectInfo: ProjectInfo): string {
  return [
    'import { android, defineConfig, ios, macos } from "nativite";',
    "",
    "export default defineConfig({",
    "  app: {",
    `    name: "${projectInfo.appName}",`,
    `    bundleId: "${projectInfo.bundleId.replaceAll("-", "")}",`,
    '    version: "1.0.0",',
    "    buildNumber: 1,",
    "  },",
    "  platforms: [ios(), macos(), android()],",
    "});",
    "",
  ].join("\n");
}

async function findViteConfig(projectRoot: string): Promise<string | undefined> {
  const candidates = VITE_CONFIG_FILENAMES.map((filename) => join(projectRoot, filename));
  const existing = await Promise.all(
    candidates.map(async (path) => ((await fileExists(path)) ? path : undefined)),
  );

  return existing.find((path) => path !== undefined);
}

async function updateViteConfig(configPath: string): Promise<ViteUpdateResult> {
  const source = await readFile(configPath, "utf8");
  if (source.includes("nativite()")) {
    return { updated: false, reason: `${basename(configPath)} already appears to use nativite().` };
  }

  const pluginsArrayPattern = /plugins:\s*\[([^\]]*)\]/m;
  const pluginsArrayMatch = pluginsArrayPattern.exec(source);
  if (!pluginsArrayMatch) {
    return {
      updated: false,
      reason: `${basename(configPath)} does not contain an inline plugins array.`,
    };
  }

  const withImport =
    source.includes('"nativite/vite"') || source.includes("'nativite/vite'")
      ? source
      : addNativiteImport(source);
  const updated = withImport.replace(pluginsArrayPattern, (_match, plugins: string) =>
    plugins.trim().length === 0
      ? "plugins: [nativite()]"
      : `plugins: [nativite(), ${plugins.trim()}]`,
  );

  await writeFile(configPath, updated);
  return { updated: true };
}

function addNativiteImport(source: string): string {
  const lines = source.split("\n");
  const lastImportIndex = lines.reduce(
    (lastIndex, line, index) => (line.trim().startsWith("import ") ? index : lastIndex),
    -1,
  );
  if (lastImportIndex === -1) {
    return `import { nativite } from "nativite/vite";\n${source}`;
  }

  return [
    ...lines.slice(0, lastImportIndex + 1),
    'import { nativite } from "nativite/vite";',
    ...lines.slice(lastImportIndex + 1),
  ].join("\n");
}

function printManualViteInstructions(logger: NativiteLogger, reason: string): void {
  logger.warn(reason);
  logger.warn('Add this import to your Vite config: import { nativite } from "nativite/vite";');
  logger.warn("Add nativite() to your Vite plugins array, for example: plugins: [nativite()]");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
