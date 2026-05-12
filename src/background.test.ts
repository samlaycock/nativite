import { describe, expect, it } from "bun:test";

import {
  backgroundTaskPath,
  createBackgroundTaskManifest,
  createBackgroundTaskManifestEntry,
  defineBackgroundTask,
} from "./background.ts";

describe("background task API", () => {
  it("keeps the task runner as author code instead of serializing it into metadata", () => {
    const task = defineBackgroundTask({
      id: "sync-inbox",
      ios: { kind: "app-refresh" },
      android: { kind: "periodic-work", repeatIntervalMinutes: 15 },
      run() {},
    });

    const entry = createBackgroundTaskManifestEntry(task, "sync-inbox.js");

    expect(entry).toEqual({
      id: "sync-inbox",
      bundle: "sync-inbox.js",
      platforms: {
        ios: { kind: "app-refresh" },
        android: { kind: "periodic-work", repeatIntervalMinutes: 15 },
      },
    });
    expect(JSON.stringify(entry)).not.toContain("run");
  });

  it("creates a versioned manifest from generated entries", () => {
    const manifest = createBackgroundTaskManifest([
      {
        id: "refresh-session",
        bundle: "refresh-session.js",
        platforms: {},
      },
    ]);

    expect(manifest).toEqual({
      version: 1,
      tasks: [
        {
          id: "refresh-session",
          bundle: "refresh-session.js",
          platforms: {},
        },
      ],
    });
  });

  it("normalizes string and object registrations to entrypoint paths", () => {
    expect(backgroundTaskPath("./src/background/sync.task.ts")).toBe(
      "./src/background/sync.task.ts",
    );
    expect(backgroundTaskPath({ path: "./src/background/refresh.task.ts" })).toBe(
      "./src/background/refresh.task.ts",
    );
  });
});
