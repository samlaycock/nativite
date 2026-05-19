import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Node CLI smoke", () => {
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
    "runs the built CLI with Node and loads nativite.config.ts",
    () => {
      execFileSync("bun", ["run", "build"], { stdio: "pipe" });

      const projectRoot = makeTempDir("nativite-node-cli-");
      const nodeModulesDir = join(projectRoot, "node_modules");
      mkdirSync(nodeModulesDir, { recursive: true });
      cpSync(process.cwd(), join(nodeModulesDir, "nativite"), {
        recursive: true,
        filter: (source) => !source.includes(`${process.cwd()}/.git`),
      });

      const vitePackagePath = join(process.cwd(), "node_modules", "vite");
      if (existsSync(vitePackagePath)) {
        symlinkSync(vitePackagePath, join(nodeModulesDir, "vite"), "dir");
      }

      writeFileSync(
        join(projectRoot, "package.json"),
        JSON.stringify({
          type: "module",
          dependencies: { nativite: "file:./node_modules/nativite" },
        }),
      );
      writeFileSync(
        join(projectRoot, "index.html"),
        `<main id="app"></main><script type="module" src="/src/main.ts"></script>`,
      );
      mkdirSync(join(projectRoot, "src"));
      writeFileSync(
        join(projectRoot, "src", "main.ts"),
        `document.querySelector("#app")!.textContent = "ok";`,
      );
      writeFileSync(
        join(projectRoot, "vite.config.ts"),
        `import { defineConfig } from "vite";
import { nativite } from "nativite/vite";

export default defineConfig({
  plugins: [nativite()],
});
`,
      );
      writeFileSync(
        join(projectRoot, "nativite.config.ts"),
        `import { defineConfig, ios } from "nativite";

export default defineConfig({
  app: {
    name: "NodeCliApp",
    bundleId: "com.example.nodecli",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios()],
});
`,
      );

      const cliPath = join(projectRoot, "node_modules", "nativite", "dist", "cli", "index.mjs");
      execFileSync(process.execPath, [cliPath, "build", "--platform", "ios"], {
        cwd: projectRoot,
        stdio: "pipe",
      });

      expect(existsSync(join(projectRoot, ".nativite", "ios", "NodeCliApp.xcodeproj"))).toBe(true);
    },
    { timeout: 60_000 },
  );
});
