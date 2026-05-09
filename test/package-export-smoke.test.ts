import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import packageJson from "../package.json";

interface ConditionalPackageExport {
  readonly import?: string;
  readonly require?: string;
  readonly types?: string;
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
    "imports every advertised JavaScript subpath from dist",
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
          return value.import ? [specifier] : [];
        })
        .filter((entry) => entry !== undefined);

      expect(subpaths).not.toHaveLength(0);

      for (const specifier of subpaths) {
        const scriptPath = join(packageRoot, `import-${specifier.replaceAll("/", "-")}.mjs`);
        const source = `const module = await import(${JSON.stringify(specifier)});\nconsole.log(Object.keys(module).join(","));\n`;

        writeFileSync(scriptPath, source);
        execFileSync(process.execPath, [scriptPath], { cwd: packageRoot, stdio: "pipe" });
      }
    },
    { timeout: 60_000 },
  );

  it(
    "does not expose the cli as a package import",
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
          `try {`,
          `  await import("nativite/cli");`,
          `} catch (error) {`,
          `  process.exit(0);`,
          `}`,
          `throw new Error("Expected nativite/cli to be private");`,
          ``,
        ].join("\n"),
      );

      execFileSync(process.execPath, [scriptPath], { cwd: packageRoot, stdio: "pipe" });
    },
    { timeout: 30_000 },
  );
});
