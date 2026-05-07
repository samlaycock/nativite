import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NativiteLogger } from "./logger.ts";

import { runInitCommand } from "./init-command.ts";

function createMockLogger(): NativiteLogger {
  return {
    tag: "nativite",
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

describe("runInitCommand", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "nativite-init-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { force: true, recursive: true });
  });

  it("creates the minimum Nativite config and adds the Vite plugin", async () => {
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "@example/my-vite-app" }),
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import { defineConfig } from "vite";',
        "",
        "export default defineConfig({",
        "  plugins: [],",
        "});",
        "",
      ].join("\n"),
    );

    const exitCode = await runInitCommand(
      {},
      {
        cwd: () => projectRoot,
        createLogger: createMockLogger,
      },
    );
    const nativiteConfig = await Bun.file(join(projectRoot, "nativite.config.ts")).text();
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(nativiteConfig).toContain('name: "MyViteApp"');
    expect(nativiteConfig).toContain('bundleId: "com.example.myviteapp"');
    expect(nativiteConfig).toContain("platforms: [ios(), macos(), android()]");
    expect(viteConfig).toContain('import { nativite } from "nativite/vite";');
    expect(viteConfig).toContain("plugins: [nativite()]");
  });

  it("preserves an existing nativite.config.ts unless force is enabled", async () => {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "existing-app" }));
    await writeFile(
      join(projectRoot, "nativite.config.ts"),
      "export default { existing: true };\n",
    );

    const exitCode = await runInitCommand(
      {},
      {
        cwd: () => projectRoot,
        createLogger: createMockLogger,
      },
    );
    const nativiteConfig = await Bun.file(join(projectRoot, "nativite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(nativiteConfig).toBe("export default { existing: true };\n");
  });

  it("prints manual Vite instructions when automatic editing is ambiguous", async () => {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "fallback-app" }));
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import { defineConfig } from "vite";',
        "",
        "const plugins = [];",
        "export default defineConfig({ plugins });",
        "",
      ].join("\n"),
    );
    const warn = mock(() => {});
    const logger: NativiteLogger = {
      ...createMockLogger(),
      warn,
    };

    const exitCode = await runInitCommand(
      {},
      {
        cwd: () => projectRoot,
        createLogger: () => logger,
      },
    );
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).not.toContain("nativite/vite");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Add this import"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("plugins: [nativite()]"));
  });
});
