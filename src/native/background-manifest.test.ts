import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NativiteConfig } from "../index.ts";

import { baseConfig } from "../../test/fixtures.ts";
import {
  BACKGROUND_MANIFEST_RELATIVE_PATH,
  backgroundTaskHashInputs,
  buildBackgroundTaskBundles,
  resolveBackgroundTaskEntries,
  resolveBackgroundTaskManifest,
  writeBackgroundTaskBundles,
  writeBackgroundTaskManifest,
} from "./background-manifest.ts";

describe("background task native manifest generation", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "nativite-background-manifest-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("loads registered task modules into a deterministic source-free manifest", async () => {
    const cwd = makeTempDir();
    writeFileSync(
      join(cwd, "sync.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
export default defineBackgroundTask({
  id: "sync-inbox",
  android: { kind: "periodic-work", repeatIntervalMinutes: 15 },
  ios: { kind: "app-refresh" },
  run() {},
});
`,
    );

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./sync.task.ts"],
    };

    const manifest = await resolveBackgroundTaskManifest(config, cwd);

    expect(manifest).toEqual({
      version: 1,
      tasks: [
        {
          id: "sync-inbox",
          bundle: "sync.task.js",
          platforms: {
            android: { kind: "periodic-work", repeatIntervalMinutes: 15 },
            ios: { kind: "app-refresh" },
          },
        },
      ],
    });
    expect(JSON.stringify(manifest)).not.toContain("run");
  });

  it("rejects task modules without defineBackgroundTask-compatible defaults", async () => {
    const cwd = makeTempDir();
    writeFileSync(join(cwd, "invalid.task.ts"), "export default { id: 'invalid' };\n");

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./invalid.task.ts"],
    };

    expect.assertions(2);
    try {
      await resolveBackgroundTaskManifest(config, cwd);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain(
        "must default-export a defineBackgroundTask() result",
      );
    }
  });

  it("rejects duplicate task ids across registered modules", async () => {
    const cwd = makeTempDir();
    const source = `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
export default defineBackgroundTask({ id: "duplicate", run() {} });
`;
    writeFileSync(join(cwd, "first.task.ts"), source);
    writeFileSync(join(cwd, "second.task.ts"), source);

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./first.task.ts", "./second.task.ts"],
    };

    expect.assertions(2);
    try {
      await resolveBackgroundTaskManifest(config, cwd);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Duplicate background task id "duplicate"');
    }
  });

  it("rejects duplicate bundle names across registered modules", async () => {
    const cwd = makeTempDir();
    writeFileSync(
      join(cwd, "first.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
export default defineBackgroundTask({ id: "first", run() {} });
`,
    );
    mkdirSync(join(cwd, "nested"), { recursive: true });
    writeFileSync(
      join(cwd, "nested", "first.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
export default defineBackgroundTask({ id: "second", run() {} });
`,
    );

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./first.task.ts", "./nested/first.task.ts"],
    };

    expect.assertions(2);
    try {
      await resolveBackgroundTaskManifest(config, cwd);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Duplicate background task bundle "first.task.js"');
    }
  });

  it("writes manifests under the shared native background directory", () => {
    const cwd = makeTempDir();
    const outputPath = writeBackgroundTaskManifest({ version: 1, tasks: [] }, cwd);

    expect(outputPath).toBe(join(cwd, BACKGROUND_MANIFEST_RELATIVE_PATH));
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf-8"))).toEqual({ version: 1, tasks: [] });
  });

  it("bundles registered task entrypoints into manifest-referenced native assets", async () => {
    const cwd = makeTempDir();
    writeFileSync(join(cwd, "api.ts"), "export const endpoint = '/api/sync';\n");
    writeFileSync(
      join(cwd, "sync.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
import { endpoint } from "./api";
export default defineBackgroundTask({
  id: "sync-inbox",
  async run(ctx) {
    await ctx.fetch(endpoint);
  },
});
`,
    );

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./sync.task.ts"],
    };
    const entries = await resolveBackgroundTaskEntries(config, cwd);
    const bundles = await buildBackgroundTaskBundles(entries, cwd);
    const bundlePaths = writeBackgroundTaskBundles(bundles, cwd);
    const bundlePath = bundlePaths[0];

    expect(bundlePath).toBe(join(cwd, "nativite-background", "sync.task.js"));
    if (!bundlePath) throw new Error("Expected a background task bundle path.");
    expect(existsSync(bundlePath)).toBe(true);
    expect(readFileSync(bundlePath, "utf-8")).toContain("/api/sync");
  });

  it("fails when a resolved task entrypoint cannot be bundled", async () => {
    const cwd = makeTempDir();
    const taskPath = join(cwd, "missing.task.ts");
    writeFileSync(
      taskPath,
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
export default defineBackgroundTask({ id: "missing", run() {} });
`,
    );

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./missing.task.ts"],
    };
    const entries = await resolveBackgroundTaskEntries(config, cwd);
    rmSync(taskPath);

    expect.assertions(1);
    try {
      await buildBackgroundTaskBundles(entries, cwd);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("does not stub unrelated project modules named src/background.ts", async () => {
    const cwd = makeTempDir();
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "background.ts"),
      "export const value = 'project-background';\n",
    );
    writeFileSync(
      join(cwd, "sync.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
import { value } from "./src/background";
export default defineBackgroundTask({
  id: "sync-inbox",
  async run(ctx) {
    ctx.log.info(value);
  },
});
`,
    );

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./sync.task.ts"],
    };
    const entries = await resolveBackgroundTaskEntries(config, cwd);
    const [bundle] = await buildBackgroundTaskBundles(entries, cwd);

    expect(bundle?.code).toContain("project-background");
  });

  it("includes imported task dependencies in generation hash inputs", async () => {
    const cwd = makeTempDir();
    const helperPath = join(cwd, "api.ts");
    writeFileSync(helperPath, "export const endpoint = '/api/first';\n");
    writeFileSync(
      join(cwd, "sync.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
import { endpoint } from "./api";
export default defineBackgroundTask({ id: "sync-inbox", run(ctx) { ctx.fetch(endpoint); } });
`,
    );

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./sync.task.ts"],
    };
    const entries = await resolveBackgroundTaskEntries(config, cwd);
    const firstHashInputs = backgroundTaskHashInputs(
      await buildBackgroundTaskBundles(entries, cwd),
    );
    writeFileSync(helperPath, "export const endpoint = '/api/second';\n");
    const secondHashInputs = backgroundTaskHashInputs(
      await buildBackgroundTaskBundles(entries, cwd),
    );

    expect(firstHashInputs).not.toEqual(secondHashInputs);
    expect(secondHashInputs[0]?.content).toContain("/api/second");
  });

  it("inlines dynamic imports into a single native task bundle", async () => {
    const cwd = makeTempDir();
    writeFileSync(join(cwd, "lazy.ts"), "export const endpoint = '/api/lazy';\n");
    writeFileSync(
      join(cwd, "sync.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";
export default defineBackgroundTask({
  id: "sync-inbox",
  async run(ctx) {
    const lazy = await import("./lazy");
    await ctx.fetch(lazy.endpoint);
  },
});
`,
    );

    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./sync.task.ts"],
    };
    const entries = await resolveBackgroundTaskEntries(config, cwd);
    const bundles = await buildBackgroundTaskBundles(entries, cwd);

    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.code).toContain("/api/lazy");
    expect(bundles[0]?.code).not.toContain("import(");
  });
});
