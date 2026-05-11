import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { androidConfig } from "../../../test/fixtures.ts";
import { normalizeAndroidDevServerUrl, syncAndroidDevMetadata } from "./dev-metadata.ts";
import { generateProject } from "./generator.ts";

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

  it("copies dev metadata into Android debug assets in dev mode", () => {
    const cwd = makeTempDir();
    const sourcePath = join(cwd, ".nativite", "dev.json");
    const destinationPath = join(
      cwd,
      ".nativite",
      "android",
      "app",
      "src",
      "main",
      "assets",
      "dev.json",
    );
    mkdirSync(join(cwd, ".nativite"), { recursive: true });
    writeFileSync(sourcePath, JSON.stringify({ devURL: "http://localhost:5173/" }));

    syncAndroidDevMetadata(cwd, "dev");

    expect(JSON.parse(readFileSync(destinationPath, "utf-8"))).toEqual({
      devURL: "http://10.0.2.2:5173/",
      android: {
        emulatorURL: "http://10.0.2.2:5173/",
        deviceURL: "http://10.0.2.2:5173/",
      },
    });
  });

  it("removes stale Android dev metadata outside dev mode", () => {
    const cwd = makeTempDir();
    const destinationPath = join(
      cwd,
      ".nativite",
      "android",
      "app",
      "src",
      "main",
      "assets",
      "dev.json",
    );
    mkdirSync(join(destinationPath, ".."), { recursive: true });
    writeFileSync(destinationPath, JSON.stringify({ devURL: "http://10.0.2.2:5173/" }));

    syncAndroidDevMetadata(cwd, "build");

    expect(existsSync(destinationPath)).toBe(false);
  });

  it("normalizes loopback dev server URLs for Android emulators", () => {
    expect(normalizeAndroidDevServerUrl("http://localhost:5173/app?x=1#hash")).toBe(
      "http://10.0.2.2:5173/app?x=1#hash",
    );
    expect(normalizeAndroidDevServerUrl("http://127.0.0.1:5173/")).toBe("http://10.0.2.2:5173/");
    expect(normalizeAndroidDevServerUrl("http://192.168.1.10:5173/")).toBe(
      "http://192.168.1.10:5173/",
    );
  });

  it("prefers explicit Android emulator and device URLs from dev metadata", () => {
    const cwd = makeTempDir();
    const sourcePath = join(cwd, ".nativite", "dev.json");
    const destinationPath = join(
      cwd,
      ".nativite",
      "android",
      "app",
      "src",
      "main",
      "assets",
      "dev.json",
    );
    mkdirSync(join(cwd, ".nativite"), { recursive: true });
    writeFileSync(
      sourcePath,
      JSON.stringify({
        devURL: "http://192.168.1.2:5173/",
        native: {
          androidEmulatorURL: "http://10.0.2.2:5173/",
          androidDeviceURL: "http://192.168.1.2:5173/",
          androidUsbReverseCommand: "adb reverse tcp:5173 tcp:5173",
        },
      }),
    );

    syncAndroidDevMetadata(cwd, "dev");

    expect(JSON.parse(readFileSync(destinationPath, "utf-8"))).toEqual({
      devURL: "http://10.0.2.2:5173/",
      native: {
        androidEmulatorURL: "http://10.0.2.2:5173/",
        androidDeviceURL: "http://192.168.1.2:5173/",
        androidUsbReverseCommand: "adb reverse tcp:5173 tcp:5173",
      },
      android: {
        emulatorURL: "http://10.0.2.2:5173/",
        deviceURL: "http://192.168.1.2:5173/",
        usbReverseCommand: "adb reverse tcp:5173 tcp:5173",
      },
    });
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
