import { afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { androidConfig } from "../../../test/fixtures.ts";
import { normalizeAndroidDevServerUrl, syncAndroidDevMetadata } from "./dev-metadata.ts";
import { bootstrapAndroidGradleWrapper, generateProject } from "./generator.ts";

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

  it("prints actionable diagnostics when global Gradle is missing", () => {
    const cwd = makeTempDir();
    const runCommand = mock(() => {
      throw new Error("gradle: command not found");
    });

    try {
      bootstrapAndroidGradleWrapper(cwd, runCommand);
      throw new Error("Expected Android Gradle bootstrap validation to fail.");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(
        "Android Gradle wrapper bootstrap failed: gradle: command not found",
      );
      expect(message).toContain("Install Gradle or make the `gradle` command available on PATH.");
      expect(message).toContain(
        "Verify Java is installed and JAVA_HOME points to a supported JDK.",
      );
      expect(message).toContain("Verify the Android SDK is installed via Android Studio");
      expect(runCommand).toHaveBeenCalledTimes(1);
    }
  });

  it("prints actionable diagnostics when Gradle wrapper bootstrap fails", () => {
    const cwd = makeTempDir();
    const runCommand = mock((command: string) => {
      if (command === "gradle --version") return "Gradle 8.13";
      throw new Error("Could not determine java version");
    });

    expect(() => bootstrapAndroidGradleWrapper(cwd, runCommand)).toThrow(
      "Gradle was found, but wrapper generation failed. Could not determine java version",
    );
    expect(runCommand).toHaveBeenNthCalledWith(1, "gradle --version", {
      cwd,
      stdio: "pipe",
      timeout: 30_000,
    });
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      "gradle wrapper --gradle-version 8.13 --no-daemon",
      {
        cwd,
        stdio: "pipe",
        timeout: 180_000,
      },
    );
    expect(runCommand).toHaveBeenCalledTimes(2);
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

  it("strips diagnostics from Android assets when syncing full Vite dev metadata", () => {
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
        urls: {
          local: ["http://localhost:5173/"],
          network: ["http://192.168.1.2:5173/"],
        },
        native: {
          iosSimulatorURL: "http://localhost:5173/",
          iosDeviceURL: "http://192.168.1.2:5173/",
          androidEmulatorURL: "http://10.0.2.2:5173/",
          androidDeviceURL: "http://192.168.1.2:5173/",
          androidUsbReverseCommand: "adb reverse tcp:5173 tcp:5173",
        },
        diagnostics: ["Use the network URL for physical iOS and Android devices on the same LAN."],
      }),
    );

    syncAndroidDevMetadata(cwd, "dev");

    expect(JSON.parse(readFileSync(destinationPath, "utf-8"))).toEqual({
      devURL: "http://10.0.2.2:5173/",
      urls: {
        local: ["http://localhost:5173/"],
        network: ["http://192.168.1.2:5173/"],
      },
      native: {
        iosSimulatorURL: "http://localhost:5173/",
        iosDeviceURL: "http://192.168.1.2:5173/",
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

  it(
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

  it("rejects unsupported Android background task kinds", async () => {
    const cwd = makeTempDir();
    writeFileSync(
      join(cwd, "refresh.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";

export default defineBackgroundTask({
  id: "refresh",
  android: { kind: "foreground-service" },
  run() {},
});
`,
    );

    try {
      await generateProject({ ...androidConfig, backgroundTasks: ["./refresh.task.ts"] }, cwd);
      throw new Error("Expected Android background task validation to fail.");
    } catch (err) {
      expect((err as Error).message).toContain(
        'Unsupported Android background task kind for "refresh". Nativite currently supports android.kind: "one-off-work" and "periodic-work".',
      );
    }
  });

  it("rejects invalid Android periodic intervals", async () => {
    const cwd = makeTempDir();
    writeFileSync(
      join(cwd, "sync.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";

export default defineBackgroundTask({
  id: "sync",
  android: { kind: "periodic-work", repeatIntervalMinutes: 10 },
  run() {},
});
`,
    );

    try {
      await generateProject({ ...androidConfig, backgroundTasks: ["./sync.task.ts"] }, cwd);
      throw new Error("Expected Android background task validation to fail.");
    } catch (err) {
      expect((err as Error).message).toContain(
        'Invalid Android background task option for "sync". android.repeatIntervalMinutes must be at least 15 for periodic work.',
      );
    }
  });

  it("rejects Android backoff policies without an explicit backoff delay", async () => {
    const cwd = makeTempDir();
    writeFileSync(
      join(cwd, "sync.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";

export default defineBackgroundTask({
  id: "sync",
  android: { kind: "one-off-work", backoffPolicy: "linear" },
  run() {},
});
`,
    );

    try {
      await generateProject({ ...androidConfig, backgroundTasks: ["./sync.task.ts"] }, cwd);
      throw new Error("Expected Android background task validation to fail.");
    } catch (err) {
      expect((err as Error).message).toContain(
        'Invalid Android background task option for "sync". android.backoffPolicy requires android.backoffDelayMinutes.',
      );
    }
  });

  it(
    "generates gradlew.bat",
    async () => {
      const cwd = makeTempDir();
      const result = await generateProject(androidConfig, cwd);
      const gradlewBatPath = join(result.projectPath, "gradlew.bat");

      expect(existsSync(gradlewBatPath)).toBe(true);
    },
    { timeout: 60_000 },
  );

  it(
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

  it(
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
