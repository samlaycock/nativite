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

  const edit = createViteConfigEdit(source);
  if (!edit) {
    return {
      updated: false,
      reason: `${basename(configPath)} does not contain a supported Vite config shape.`,
    };
  }

  const withPlugin = edit(source);
  const updated =
    withPlugin.includes('"nativite/vite"') || withPlugin.includes("'nativite/vite'")
      ? withPlugin
      : addNativiteImport(withPlugin);

  await writeFile(configPath, updated);
  return { updated: true };
}

type SourceEdit = (source: string) => string;

interface Range {
  readonly end: number;
  readonly start: number;
}

interface PropertyMatch extends Range {
  readonly shorthand: boolean;
  readonly value?: Range;
}

function createViteConfigEdit(source: string): SourceEdit | undefined {
  const configObject = findViteConfigObject(source);
  if (!configObject) {
    return undefined;
  }

  const pluginsProperty = findObjectProperty(source, configObject, "plugins");
  if (!pluginsProperty) {
    return (withImport) => insertPluginsProperty(withImport, configObject);
  }

  if (!pluginsProperty.value) {
    const pluginsArray = findVariableArray(source, "plugins");
    return pluginsArray ? (withImport) => insertArrayItem(withImport, pluginsArray) : undefined;
  }

  const valueStart = skipTrivia(source, pluginsProperty.value.start);
  if (source[valueStart] === "[") {
    const arrayEnd = findMatchingBracket(source, valueStart, "[", "]");
    return arrayEnd
      ? (withImport) => insertArrayItem(withImport, { start: valueStart, end: arrayEnd + 1 })
      : undefined;
  }

  const value = source.slice(valueStart, pluginsProperty.value.end).trim();
  if (isIdentifier(value)) {
    const pluginsArray = findVariableArray(source, value);
    return pluginsArray ? (withImport) => insertArrayItem(withImport, pluginsArray) : undefined;
  }

  return undefined;
}

function findViteConfigObject(source: string): Range | undefined {
  const exportDefaultStart = findExportDefaultExpressionStart(source);
  if (exportDefaultStart === undefined) {
    return undefined;
  }

  if (startsWithIdentifier(source, exportDefaultStart, "mergeConfig")) {
    return findCallObjectArgumentAt(source, exportDefaultStart, "mergeConfig");
  }

  if (startsWithIdentifier(source, exportDefaultStart, "defineConfig")) {
    return findCallObjectArgumentAt(source, exportDefaultStart, "defineConfig");
  }

  return undefined;
}

function findExportDefaultExpressionStart(source: string): number | undefined {
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const exportIndex = findIdentifier(source, "export", searchIndex);
    if (exportIndex === -1) {
      return undefined;
    }

    const defaultIndex = skipTrivia(source, exportIndex + "export".length);
    if (startsWithIdentifier(source, defaultIndex, "default")) {
      return skipTrivia(source, defaultIndex + "default".length);
    }

    searchIndex = exportIndex + "export".length;
  }

  return undefined;
}

function findCallObjectArgumentAt(
  source: string,
  callStart: number,
  callName: string,
): Range | undefined {
  const parenStart = skipTrivia(source, callStart + callName.length);
  if (source[parenStart] !== "(") {
    return undefined;
  }

  const parenEnd = findMatchingBracket(source, parenStart, "(", ")");
  if (parenEnd === undefined) {
    return undefined;
  }

  const args = findTopLevelArgumentRanges(source, parenStart + 1, parenEnd);
  const objectArg =
    callName === "mergeConfig"
      ? findLastObjectArgument(source, args)
      : args.find((arg) => source[skipTrivia(source, arg.start)] === "{");

  if (!objectArg) {
    return undefined;
  }

  const objectStart = skipTrivia(source, objectArg.start);
  const objectEnd = findMatchingBracket(source, objectStart, "{", "}");
  return objectEnd === undefined ? undefined : { start: objectStart, end: objectEnd + 1 };
}

function findObjectProperty(
  source: string,
  objectRange: Range,
  name: string,
): PropertyMatch | undefined {
  let index = objectRange.start + 1;

  while (index < objectRange.end - 1) {
    index = skipTriviaAndCommas(source, index);
    if (index >= objectRange.end - 1) {
      break;
    }

    const propertyStart = index;
    const propertyEnd = findPropertyEnd(source, index, objectRange.end - 1);
    const colonIndex = findTopLevelColon(source, propertyStart, propertyEnd);
    const propertyNameEnd = colonIndex ?? propertyEnd;
    const propertyName = source.slice(propertyStart, propertyNameEnd).trim();

    if (propertyName === name) {
      return colonIndex === undefined
        ? { start: propertyStart, end: propertyEnd, shorthand: true }
        : {
            start: propertyStart,
            end: propertyEnd,
            shorthand: false,
            value: { start: colonIndex + 1, end: propertyEnd },
          };
    }

    index = propertyEnd + 1;
  }

  return undefined;
}

function findVariableArray(source: string, name: string): Range | undefined {
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const declaration = findVariableDeclaration(source, name, searchIndex);
    if (!declaration) {
      return undefined;
    }

    const arrayStart = skipTrivia(source, declaration.end);
    if (source[arrayStart] === "[") {
      const arrayEnd = findMatchingBracket(source, arrayStart, "[", "]");
      return arrayEnd === undefined ? undefined : { start: arrayStart, end: arrayEnd + 1 };
    }

    searchIndex = declaration.end;
  }

  return undefined;
}

function findVariableDeclaration(
  source: string,
  name: string,
  fromIndex: number,
): Range | undefined {
  const declarationKinds = ["const", "let", "var"] as const;
  const matches = declarationKinds
    .map((kind) => {
      const start = findIdentifier(source, kind, fromIndex);
      return start === -1 ? undefined : { start, kind };
    })
    .filter((match) => match !== undefined)
    .sort((left, right) => left.start - right.start);
  const earliestMatch = matches[0];
  if (!earliestMatch) {
    return undefined;
  }

  const nameStart = skipWhitespace(source, earliestMatch.start + earliestMatch.kind.length);
  if (!startsWithIdentifier(source, nameStart, name)) {
    return findVariableDeclaration(source, name, earliestMatch.start + earliestMatch.kind.length);
  }

  const equalsStart = skipWhitespace(source, nameStart + name.length);
  if (source[equalsStart] !== "=") {
    return findVariableDeclaration(source, name, earliestMatch.start + earliestMatch.kind.length);
  }

  return { start: earliestMatch.start, end: equalsStart + 1 };
}

function findLastObjectArgument(source: string, args: readonly Range[]): Range | undefined {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const arg = args[index];
    if (arg && source[skipTrivia(source, arg.start)] === "{") {
      return arg;
    }
  }

  return undefined;
}

function insertArrayItem(source: string, arrayRange: Range): string {
  const contentStart = arrayRange.start + 1;
  const contentEnd = arrayRange.end - 1;
  const content = source.slice(contentStart, contentEnd);
  if (content.trim().length === 0) {
    return `${source.slice(0, contentStart)}nativite()${source.slice(contentEnd)}`;
  }

  if (content.includes("\n")) {
    const itemIndent = detectArrayItemIndent(source, arrayRange.start);
    return `${source.slice(0, contentStart)}\n${itemIndent}nativite(),${source.slice(contentStart)}`;
  }

  return `${source.slice(0, contentStart)}nativite(), ${source.slice(contentStart).trimStart()}`;
}

function insertPluginsProperty(source: string, objectRange: Range): string {
  const lineIndent = getLineIndent(source, objectRange.start);
  const propertyIndent = `${lineIndent}  `;
  const content = source.slice(objectRange.start + 1, objectRange.end - 1);

  if (!content.includes("\n")) {
    const existing = content.trim();
    const properties =
      existing.length === 0
        ? `${propertyIndent}plugins: [nativite()]`
        : `${propertyIndent}plugins: [nativite()],\n${propertyIndent}${existing}`;

    return `${source.slice(0, objectRange.start + 1)}\n${properties}\n${lineIndent}${source.slice(
      objectRange.end - 1,
    )}`;
  }

  return `${source.slice(0, objectRange.start + 1)}\n${propertyIndent}plugins: [nativite()],${source.slice(
    objectRange.start + 1,
  )}`;
}

function findTopLevelArgumentRanges(source: string, start: number, end: number): Range[] {
  const ranges: Range[] = [];
  let argumentStart = start;
  let index = start;

  while (index < end) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    const char = source[index];
    if (char === undefined) {
      break;
    }
    const matching = matchingCloseBracket(char);
    if (matching) {
      const closeIndex = findMatchingBracket(source, index, char, matching);
      if (closeIndex === undefined) {
        break;
      }
      index = closeIndex + 1;
      continue;
    }

    if (char === ",") {
      ranges.push({ start: argumentStart, end: index });
      argumentStart = index + 1;
    }

    index += 1;
  }

  ranges.push({ start: argumentStart, end });
  return ranges.filter((range) => source.slice(range.start, range.end).trim().length > 0);
}

function findPropertyEnd(source: string, start: number, end: number): number {
  let index = start;

  while (index < end) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    const char = source[index];
    if (char === undefined) {
      break;
    }
    const matching = matchingCloseBracket(char);
    if (matching) {
      const closeIndex = findMatchingBracket(source, index, char, matching);
      if (closeIndex === undefined) {
        return end;
      }
      index = closeIndex + 1;
      continue;
    }

    if (char === ",") {
      return index;
    }

    index += 1;
  }

  return end;
}

function findTopLevelColon(source: string, start: number, end: number): number | undefined {
  let index = start;

  while (index < end) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    const char = source[index];
    if (char === undefined) {
      break;
    }
    const matching = matchingCloseBracket(char);
    if (matching) {
      const closeIndex = findMatchingBracket(source, index, char, matching);
      if (closeIndex === undefined) {
        return undefined;
      }
      index = closeIndex + 1;
      continue;
    }

    if (char === ":") {
      return index;
    }

    index += 1;
  }

  return undefined;
}

function findMatchingBracket(
  source: string,
  start: number,
  openBracket: string,
  closeBracket: string,
): number | undefined {
  let depth = 0;
  let index = start;

  while (index < source.length) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    if (source[index] === openBracket) {
      depth += 1;
    } else if (source[index] === closeBracket) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return undefined;
}

function findIdentifier(source: string, name: string, fromIndex: number): number {
  let index = fromIndex;

  while (index < source.length) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    if (
      source.startsWith(name, index) &&
      !isIdentifierChar(source[index - 1] ?? "") &&
      !isIdentifierChar(source[index + name.length] ?? "")
    ) {
      return index;
    }

    index += 1;
  }

  return -1;
}

function startsWithIdentifier(source: string, index: number, name: string): boolean {
  return (
    source.startsWith(name, index) &&
    !isIdentifierChar(source[index - 1] ?? "") &&
    !isIdentifierChar(source[index + name.length] ?? "")
  );
}

function skipTrivia(source: string, start: number): number {
  let index = start;

  while (index < source.length) {
    const char = source[index];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }

    const skipped = skipComment(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    return index;
  }

  return index;
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (
    source[index] === " " ||
    source[index] === "\t" ||
    source[index] === "\n" ||
    source[index] === "\r"
  ) {
    index += 1;
  }
  return index;
}

function skipTriviaAndCommas(source: string, start: number): number {
  let index = skipTrivia(source, start);
  while (source[index] === ",") {
    index = skipTrivia(source, index + 1);
  }
  return index;
}

function skipNonCode(source: string, start: number): number {
  const commentEnd = skipComment(source, start);
  if (commentEnd !== start) {
    return commentEnd;
  }

  return skipString(source, start);
}

function skipComment(source: string, start: number): number {
  if (source.startsWith("//", start)) {
    const lineEnd = source.indexOf("\n", start + 2);
    return lineEnd === -1 ? source.length : lineEnd;
  }

  if (source.startsWith("/*", start)) {
    const commentEnd = source.indexOf("*/", start + 2);
    return commentEnd === -1 ? source.length : commentEnd + 2;
  }

  return start;
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") {
    return start;
  }

  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }

    if (source[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function detectArrayItemIndent(source: string, arrayStart: number): string {
  const arrayLineIndent = getLineIndent(source, arrayStart);
  const afterArrayStart = source.slice(arrayStart + 1);
  const itemIndentMatch = /\n([ \t]*)\S/.exec(afterArrayStart);
  return itemIndentMatch?.[1] ?? `${arrayLineIndent}  `;
}

function getLineIndent(source: string, index: number): string {
  const lineStart = source.lastIndexOf("\n", index) + 1;
  const indentMatch = /^[ \t]*/.exec(source.slice(lineStart, index));
  return indentMatch?.[0] ?? "";
}

function matchingCloseBracket(char: string): string | undefined {
  if (char === "(") {
    return ")";
  }
  if (char === "[") {
    return "]";
  }
  if (char === "{") {
    return "}";
  }
  return undefined;
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function isIdentifierChar(value: string): boolean {
  return /^[A-Za-z0-9_$]$/.test(value);
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
