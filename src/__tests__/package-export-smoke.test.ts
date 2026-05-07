import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import packageJson from "../../package.json";

interface ConditionalPackageExport {
  readonly import?: string;
  readonly require?: string;
}

function isConditionalPackageExport(value: unknown): value is ConditionalPackageExport {
  return typeof value === "object" && value !== null;
}

describe("built package exports", () => {
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it(
    "imports and requires every advertised JavaScript subpath from dist",
    () => {
      execFileSync("bun", ["run", "build"], { stdio: "pipe" });

      const packageRoot = makeTempDir("nativite-package-exports-");
      const nodeModulesDir = join(packageRoot, "node_modules");
      mkdirSync(nodeModulesDir, { recursive: true });
      cpSync(process.cwd(), join(nodeModulesDir, "nativite"), {
        recursive: true,
        filter: (source) => !source.includes(`${process.cwd()}/.git`),
      });

      const packageExports = packageJson.exports as Record<string, unknown>;
      const subpaths = Object.entries(packageExports)
        .flatMap(([subpath, value]) => {
          if (!isConditionalPackageExport(value)) return [];

          const specifier = subpath === "." ? "nativite" : `nativite/${subpath.slice(2)}`;
          return [
            value.import ? { condition: "import", specifier } : undefined,
            value.require ? { condition: "require", specifier } : undefined,
          ];
        })
        .filter((entry) => entry !== undefined);

      expect(subpaths).not.toHaveLength(0);

      for (const { condition, specifier } of subpaths) {
        const scriptPath = join(packageRoot, `${condition}-${specifier.replaceAll("/", "-")}.mjs`);
        const source =
          condition === "import"
            ? `const module = await import(${JSON.stringify(specifier)});\nconsole.log(Object.keys(module).join(","));\n`
            : `import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nconst module = require(${JSON.stringify(specifier)});\nconsole.log(Object.keys(module).join(","));\n`;

        writeFileSync(scriptPath, source);
        execFileSync(process.execPath, [scriptPath], { cwd: packageRoot, stdio: "pipe" });
      }
    },
    { timeout: 30_000 },
  );

  it(
    "imports the built cli subpath without parsing command-line arguments",
    () => {
      execFileSync("bun", ["run", "build"], { stdio: "pipe" });

      const packageRoot = makeTempDir("nativite-cli-import-");
      const nodeModulesDir = join(packageRoot, "node_modules");
      mkdirSync(nodeModulesDir, { recursive: true });
      cpSync(process.cwd(), join(nodeModulesDir, "nativite"), {
        recursive: true,
        filter: (source) => !source.includes(`${process.cwd()}/.git`),
      });

      const scriptPath = join(packageRoot, "import-cli.mjs");
      writeFileSync(
        scriptPath,
        [
          `const module = await import("nativite/cli");`,
          `if (typeof module.createCliProgram !== "function") {`,
          `  throw new Error("Expected nativite/cli to export createCliProgram");`,
          `}`,
          ``,
        ].join("\n"),
      );

      const output = execFileSync(process.execPath, [scriptPath], {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: "pipe",
      });

      expect(output).toBe("");
    },
    { timeout: 30_000 },
  );
});
