import { describe, expect, it } from "bun:test";

import {
  backgroundTaskPath,
  createBackgroundForTesting,
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

  it("schedules registered tasks through the background bridge namespace", async () => {
    const calls: unknown[] = [];
    const runtime = createBackgroundForTesting({
      async call(namespace, method, params) {
        calls.push({ namespace, method, params });
      },
    });

    await runtime.schedule("refresh-session", {
      payload: { reason: "manual" },
    });

    expect(calls).toEqual([
      {
        namespace: "__background__",
        method: "schedule",
        params: {
          id: "refresh-session",
          payload: '{"reason":"manual"}',
        },
      },
    ]);
  });

  it("cancels and queries registered task status through stable bridge methods", async () => {
    const calls: unknown[] = [];
    const runtime = createBackgroundForTesting({
      async call(namespace, method, params) {
        calls.push({ namespace, method, params });
        if (method === "getStatus") {
          return { id: "refresh-session", state: "scheduled", platform: "ios" };
        }
      },
    });

    await runtime.cancel("refresh-session");
    const status = await runtime.getStatus("refresh-session");

    expect(calls).toEqual([
      {
        namespace: "__background__",
        method: "cancel",
        params: { id: "refresh-session" },
      },
      {
        namespace: "__background__",
        method: "getStatus",
        params: { id: "refresh-session" },
      },
    ]);
    expect(status).toEqual({ id: "refresh-session", state: "scheduled", platform: "ios" });
  });

  it("rejects invalid task ids before calling native code", async () => {
    const runtime = createBackgroundForTesting({
      async call() {
        throw new Error("should not call native");
      },
    });

    let rejected = false;
    try {
      await runtime.schedule("");
    } catch (err) {
      rejected = true;
      expect(err).toBeInstanceOf(TypeError);
      expect((err as Error).message).toContain("non-empty string");
    }
    expect(rejected).toBe(true);
  });
});
