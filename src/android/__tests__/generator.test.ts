import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { androidConfig } from "../../__tests__/fixtures.ts";
import { generateProject } from "../generator.ts";

describe("generateProject", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "nativite-android-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it.skip(
    "generates gradlew with execute permissions",
    async () => {
      const cwd = makeTempDir();
      const result = await generateProject(androidConfig, cwd);
      const gradlewPath = join(result.projectPath, "gradlew");

      expect(existsSync(gradlewPath)).toBe(true);

      const stat = statSync(gradlewPath);
      // Check that the file is executable (owner execute bit)
      expect(stat.mode & 0o100).toBeTruthy();
    },
    { timeout: 60_000 },
  );

  it.skip(
    "generates gradlew.bat",
    async () => {
      const cwd = makeTempDir();
      const result = await generateProject(androidConfig, cwd);
      const gradlewBatPath = join(result.projectPath, "gradlew.bat");

      expect(existsSync(gradlewBatPath)).toBe(true);
    },
    { timeout: 60_000 },
  );

  it.skip(
    "generates gradle-wrapper.jar",
    async () => {
      const cwd = makeTempDir();
      const result = await generateProject(androidConfig, cwd);
      const jarPath = join(result.projectPath, "gradle", "wrapper", "gradle-wrapper.jar");

      expect(existsSync(jarPath)).toBe(true);

      // JAR should be a non-trivial binary (not an empty placeholder)
      const stat = statSync(jarPath);
      expect(stat.size).toBeGreaterThan(1000);
    },
    { timeout: 60_000 },
  );

  it.skip(
    "removes stale assets/dev.json in build mode (including skipped regeneration)",
    async () => {
      const cwd = makeTempDir();
      const first = await generateProject(androidConfig, cwd, false, "build");

      const devJsonPath = join(first.projectPath, "app", "src", "main", "assets", "dev.json");
      mkdirSync(join(first.projectPath, "app", "src", "main", "assets"), { recursive: true });
      writeFileSync(devJsonPath, JSON.stringify({ devURL: "http://10.0.2.2:5173" }));
      expect(existsSync(devJsonPath)).toBe(true);

      const second = await generateProject(androidConfig, cwd, false, "build");
      expect(second.projectPath.endsWith(".nativite/android")).toBe(true);
      expect(existsSync(devJsonPath)).toBe(false);
    },
    { timeout: 60_000 },
  );
});
