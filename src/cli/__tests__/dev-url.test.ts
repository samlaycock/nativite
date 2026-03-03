import type { FSWatcher } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as realFs from "node:fs";

// ── Mock node:fs ───────────────────────────────────────────────────────────
const mockReadFileSync = mock(() => "");
const mockWatchClose = mock(() => {});
const mockWatch = mock(
  (_path: string, _cb: (event: string, filename: string | null) => void): FSWatcher => {
    return { close: mockWatchClose } as unknown as FSWatcher;
  },
);

void mock.module("node:fs", () => ({
  ...realFs,
  readFileSync: mockReadFileSync,
  watch: mockWatch,
}));

// Import AFTER mocking
const { createDevUrlResolver } = await import("../dev-url.ts");

describe("createDevUrlResolver", () => {
  let stdoutSpy: ReturnType<typeof spyOn>;
  let stderrSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    stdoutSpy = spyOn(process.stdout, "write").mockReturnValue(true);
    stderrSpy = spyOn(process.stderr, "write").mockReturnValue(true);
    mockReadFileSync.mockReset();
    mockWatch.mockReset();
    mockWatchClose.mockReset();
    mockWatch.mockImplementation(
      (_path: string, _cb: (event: string, filename: string | null) => void): FSWatcher => {
        return { close: mockWatchClose } as unknown as FSWatcher;
      },
    );
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe("when --url flag is provided", () => {
    it("returns the URL immediately", () => {
      const resolver = createDevUrlResolver({
        url: "http://localhost:5173",
        projectRoot: "/fake/project",
      });

      expect(resolver.url).toBe("http://localhost:5173");
      resolver.close();
    });

    it("does not set up a file watcher", () => {
      const resolver = createDevUrlResolver({
        url: "http://localhost:5173",
        projectRoot: "/fake/project",
      });

      expect(mockWatch).not.toHaveBeenCalled();
      resolver.close();
    });

    it("does not attempt to read dev.json", () => {
      const resolver = createDevUrlResolver({
        url: "http://localhost:5173",
        projectRoot: "/fake/project",
      });

      expect(mockReadFileSync).not.toHaveBeenCalled();
      resolver.close();
    });

    it("fires onResolved immediately if URL is already available", () => {
      const resolver = createDevUrlResolver({
        url: "http://localhost:5173",
        projectRoot: "/fake/project",
      });

      const handler = mock(() => {});
      resolver.onResolved(handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("http://localhost:5173");
      resolver.close();
    });
  });

  describe("when no --url flag is provided", () => {
    it("reads from dev.json when it exists", () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ devURL: "http://localhost:3000" }));

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      expect(resolver.url).toBe("http://localhost:3000");
      resolver.close();
    });

    it("returns undefined when dev.json does not exist yet", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      // Make watch also fail so it falls back to polling
      mockWatch.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      expect(resolver.url).toBeUndefined();
      resolver.close();
    });

    it("sets up a file watcher on the .nativite directory", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      expect(mockWatch).toHaveBeenCalledTimes(1);
      const watchedPath = mockWatch.mock.calls[0]![0] as string;
      expect(watchedPath).toContain(".nativite");
      resolver.close();
    });

    it("resolves URL when watcher detects dev.json change", () => {
      let capturedCallback: ((event: string, filename: string | null) => void) | undefined;

      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      mockWatch.mockImplementation(
        (_path: string, cb: (event: string, filename: string | null) => void): FSWatcher => {
          capturedCallback = cb;
          return { close: mockWatchClose } as unknown as FSWatcher;
        },
      );

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      expect(resolver.url).toBeUndefined();

      // Simulate the dev.json appearing
      mockReadFileSync.mockReturnValue(JSON.stringify({ devURL: "http://localhost:5173" }));
      capturedCallback?.("change", "dev.json");

      expect(resolver.url).toBe("http://localhost:5173");
      resolver.close();
    });

    it("fires onResolved when URL is resolved via watcher", () => {
      let capturedCallback: ((event: string, filename: string | null) => void) | undefined;

      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      mockWatch.mockImplementation(
        (_path: string, cb: (event: string, filename: string | null) => void): FSWatcher => {
          capturedCallback = cb;
          return { close: mockWatchClose } as unknown as FSWatcher;
        },
      );

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      const handler = mock(() => {});
      resolver.onResolved(handler);

      // Not called yet because URL is not resolved
      expect(handler).not.toHaveBeenCalled();

      // Simulate the dev.json appearing
      mockReadFileSync.mockReturnValue(JSON.stringify({ devURL: "http://localhost:5173" }));
      capturedCallback?.("change", "dev.json");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("http://localhost:5173");
      resolver.close();
    });

    it("ignores watcher events for files other than dev.json", () => {
      let capturedCallback: ((event: string, filename: string | null) => void) | undefined;

      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      mockWatch.mockImplementation(
        (_path: string, cb: (event: string, filename: string | null) => void): FSWatcher => {
          capturedCallback = cb;
          return { close: mockWatchClose } as unknown as FSWatcher;
        },
      );

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      capturedCallback?.("change", "other-file.json");
      expect(resolver.url).toBeUndefined();
      resolver.close();
    });

    it("falls back to polling when watch throws", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      mockWatch.mockImplementation(() => {
        throw new Error("ENOENT: directory does not exist");
      });

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      // Should not throw despite watch failing
      expect(resolver.url).toBeUndefined();
      resolver.close();
    });
  });

  describe("close", () => {
    it("closes the watcher", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      resolver.close();
      expect(mockWatchClose).toHaveBeenCalled();
    });

    it("clears handlers", () => {
      const resolver = createDevUrlResolver({
        url: "http://localhost:5173",
        projectRoot: "/fake/project",
      });

      const handler = mock(() => {});
      resolver.onResolved(handler);
      // handler was already called once because url was available

      resolver.close();

      // After close, no additional notifications should occur
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("unsubscribe", () => {
    it("removes the handler from future notifications", () => {
      let capturedCallback: ((event: string, filename: string | null) => void) | undefined;

      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      mockWatch.mockImplementation(
        (_path: string, cb: (event: string, filename: string | null) => void): FSWatcher => {
          capturedCallback = cb;
          return { close: mockWatchClose } as unknown as FSWatcher;
        },
      );

      const resolver = createDevUrlResolver({
        projectRoot: "/fake/project",
      });

      const handler = mock(() => {});
      const unsub = resolver.onResolved(handler);

      // Unsubscribe before any resolution
      unsub();

      // Simulate the dev.json appearing
      mockReadFileSync.mockReturnValue(JSON.stringify({ devURL: "http://localhost:5173" }));
      capturedCallback?.("change", "dev.json");

      // Handler should not have been called
      expect(handler).not.toHaveBeenCalled();
      resolver.close();
    });
  });
});
