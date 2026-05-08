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

  it("adds the Vite plugin to a plugin variable used by defineConfig", async () => {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "plugin-var-app" }));
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import react from "@vitejs/plugin-react";',
        'import { defineConfig } from "vite";',
        "",
        "const plugins = [react()];",
        "",
        "export default defineConfig({",
        "  plugins,",
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain('import { nativite } from "nativite/vite";');
    expect(viteConfig).toContain("const plugins = [nativite(), react()];");
  });

  it("preserves multiline plugin arrays while adding the Vite plugin", async () => {
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "multiline-plugin-app" }),
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import legacy from "@vitejs/plugin-legacy";',
        'import { defineConfig } from "vite";',
        "",
        "export default defineConfig({",
        "  plugins: [",
        "    // Keep legacy plugin after nativite.",
        "    legacy(),",
        "  ],",
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain('import { nativite } from "nativite/vite";');
    expect(viteConfig).toContain(
      "  plugins: [\n    nativite(),\n    // Keep legacy plugin after nativite.",
    );
  });

  it("adds a plugins property when defineConfig has no plugins", async () => {
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "missing-plugins-app" }),
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import { defineConfig } from "vite";',
        "",
        "export default defineConfig({",
        '  server: { host: "127.0.0.1" },',
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain("  plugins: [nativite()],\n  server:");
  });

  it("adds the Vite plugin to an object passed through mergeConfig", async () => {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "merge-app" }));
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import { defineConfig, mergeConfig } from "vite";',
        "",
        "const baseConfig = defineConfig({});",
        "",
        "export default mergeConfig(baseConfig, {",
        '  root: "app",',
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain(
      "export default mergeConfig(baseConfig, {\n  plugins: [nativite()],",
    );
  });

  it("targets the exported config instead of intermediate mergeConfig calls", async () => {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "exported-app" }));
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import { defineConfig, mergeConfig } from "vite";',
        "",
        'const shared = mergeConfig({}, { resolve: { alias: { "@": "/src" } } });',
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain(
      'const shared = mergeConfig({}, { resolve: { alias: { "@": "/src" } } });',
    );
    expect(viteConfig).toContain("export default defineConfig({\n  plugins: [nativite()],");
  });

  it("formats inserted plugins property in single-line config objects", async () => {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "single-line-app" }));
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import { defineConfig } from "vite";',
        "",
        'export default defineConfig({ server: { host: "0.0.0.0" } });',
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain(
      [
        "export default defineConfig({",
        "  plugins: [nativite()],",
        '  server: { host: "0.0.0.0" }',
        "});",
      ].join("\n"),
    );
  });

  it("formats inserted plugins property in mixed-format config objects", async () => {
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "mixed-format-app" }),
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import { defineConfig } from "vite";',
        "",
        "export default defineConfig({ server: {",
        '    host: "0.0.0.0",',
        "  }",
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain(
      [
        "export default defineConfig({",
        "  plugins: [nativite()],",
        "  server: {",
        '    host: "0.0.0.0",',
      ].join("\n"),
    );
  });

  it("ignores defineConfig and mergeConfig mentions in comments and strings", async () => {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "comment-app" }));
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import { defineConfig } from "vite";',
        "",
        "/** @see defineConfig({ plugins }) */",
        'const example = "mergeConfig({}, { plugins: [] })";',
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain("/** @see defineConfig({ plugins }) */");
    expect(viteConfig).toContain('"mergeConfig({}, { plugins: [] })"');
    expect(viteConfig).toContain("export default defineConfig({\n  plugins: [nativite()],");
  });

  it("ignores commented-out plugin variable declarations", async () => {
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "commented-variable-app" }),
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import react from "@vitejs/plugin-react";',
        'import { defineConfig } from "vite";',
        "",
        "// const plugins = [oldPlugin()];",
        "const plugins = [react()];",
        "",
        "export default defineConfig({",
        "  plugins,",
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain("// const plugins = [oldPlugin()];");
    expect(viteConfig).toContain("const plugins = [nativite(), react()];");
  });

  it("ignores commented-out declarations for explicit plugin array identifiers", async () => {
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "named-variable-app" }),
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      [
        'import react from "@vitejs/plugin-react";',
        'import { defineConfig } from "vite";',
        "",
        "// const appPlugins = [oldPlugin()];",
        "const appPlugins = [react()];",
        "",
        "export default defineConfig({",
        "  plugins: appPlugins,",
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
    const viteConfig = await Bun.file(join(projectRoot, "vite.config.ts")).text();

    expect(exitCode).toBe(0);
    expect(viteConfig).toContain("// const appPlugins = [oldPlugin()];");
    expect(viteConfig).toContain("const appPlugins = [nativite(), react()];");
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
        "const createPlugins = () => [];",
        "export default defineConfig({ plugins: createPlugins() });",
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
