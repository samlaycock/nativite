import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import type { NativiteConfig, NativitePlatformPlugin } from "../../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../../platforms/registry.ts";
import type { DevUrlResolver } from "../dev-url.ts";

import { createBuildManager } from "../build-manager.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockConfig(): NativiteConfig {
  return {
    app: {
      name: "TestApp",
      bundleId: "com.example.testapp",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [
      { platform: "ios", minimumVersion: "17.0" },
      { platform: "macos", minimumVersion: "14.0" },
    ],
  } as NativiteConfig;
}

function createMockRuntime(
  id: string,
  devFn?: NativitePlatformPlugin["dev"],
): ResolvedNativitePlatformRuntime {
  const plugin: NativitePlatformPlugin = {
    name: `${id}-plugin`,
    platform: id,
  };
  if (devFn !== undefined) {
    plugin.dev = devFn;
  }
  return {
    id,
    config: { platform: id } as ResolvedNativitePlatformRuntime["config"],
    plugin,
    extensions: [`.${id}`, ".native"],
    environments: [id],
    bundlePlatform: id,
  };
}

function createMockDevUrlResolver(url?: string): DevUrlResolver {
  return {
    get url() {
      return url;
    },
    onResolved: mock(() => () => {}),
    close: mock(() => {}),
  };
}

describe("createBuildManager", () => {
  let stdoutSpy: ReturnType<typeof spyOn>;
  let stderrSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    stdoutSpy = spyOn(process.stdout, "write").mockReturnValue(true);
    stderrSpy = spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe("initialization", () => {
    it("initializes all platforms with idle status", () => {
      const devFn = mock(() => Promise.resolve());
      const runtimes = [createMockRuntime("ios", devFn), createMockRuntime("macos", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      expect(manager.statuses.get("ios")).toBe("idle");
      expect(manager.statuses.get("macos")).toBe("idle");
    });

    it("returns a statuses map with entries for each runtime", () => {
      const runtimes = [
        createMockRuntime(
          "ios",
          mock(() => Promise.resolve()),
        ),
        createMockRuntime(
          "android",
          mock(() => Promise.resolve()),
        ),
      ];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      expect(manager.statuses.size).toBe(2);
    });
  });

  describe("triggerBuild", () => {
    it("transitions to building when triggerBuild is called", () => {
      const devFn = mock(() => new Promise<void>(() => {})); // never resolves
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      manager.triggerBuild("ios");
      expect(manager.statuses.get("ios")).toBe("building");
    });

    it("transitions to ready when build succeeds", async () => {
      const devFn = mock(() => Promise.resolve());
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      manager.triggerBuild("ios");

      // Wait for the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(manager.statuses.get("ios")).toBe("ready");
    });

    it("transitions to error when build fails", async () => {
      const devFn = mock(() => Promise.reject(new Error("build failure")));
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      manager.triggerBuild("ios");

      // Wait for the promise to reject
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(manager.statuses.get("ios")).toBe("error");
    });

    it("ignores duplicate triggerBuild while building", () => {
      const devFn = mock(() => new Promise<void>(() => {})); // never resolves
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      manager.triggerBuild("ios");
      manager.triggerBuild("ios");

      // dev should only be called once
      expect(devFn).toHaveBeenCalledTimes(1);
    });

    it("allows rebuild after build completes with ready", async () => {
      const devFn = mock(() => Promise.resolve());
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      manager.triggerBuild("ios");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(manager.statuses.get("ios")).toBe("ready");

      manager.triggerBuild("ios");
      expect(devFn).toHaveBeenCalledTimes(2);
    });

    it("allows rebuild after build completes with error", async () => {
      const devFn = mock(() => Promise.reject(new Error("fail")));
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      manager.triggerBuild("ios");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(manager.statuses.get("ios")).toBe("error");

      manager.triggerBuild("ios");
      expect(devFn).toHaveBeenCalledTimes(2);
    });

    it("ignores unknown platform id", () => {
      const devFn = mock(() => Promise.resolve());
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      // Should not throw
      manager.triggerBuild("unknown-platform");
      expect(devFn).not.toHaveBeenCalled();
    });

    it("ignores platform without dev hook", () => {
      // Runtime without a dev function
      const runtimes = [createMockRuntime("ios")];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      // Should not throw; status stays idle
      manager.triggerBuild("ios");
      expect(manager.statuses.get("ios")).toBe("idle");
    });

    it("does NOT trigger build when devUrl is undefined", () => {
      const devFn = mock(() => Promise.resolve());
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver(undefined),
      });

      manager.triggerBuild("ios");
      expect(devFn).not.toHaveBeenCalled();
      expect(manager.statuses.get("ios")).toBe("idle");
    });

    it("supports concurrent builds for different platforms", async () => {
      let iosResolve: (() => void) | undefined;
      let macosResolve: (() => void) | undefined;

      const iosDevFn = mock(
        () =>
          new Promise<void>((resolve) => {
            iosResolve = resolve;
          }),
      );
      const macosDevFn = mock(
        () =>
          new Promise<void>((resolve) => {
            macosResolve = resolve;
          }),
      );

      const runtimes = [createMockRuntime("ios", iosDevFn), createMockRuntime("macos", macosDevFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      manager.triggerBuild("ios");
      manager.triggerBuild("macos");

      expect(manager.statuses.get("ios")).toBe("building");
      expect(manager.statuses.get("macos")).toBe("building");

      // Resolve ios first
      iosResolve?.();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(manager.statuses.get("ios")).toBe("ready");
      expect(manager.statuses.get("macos")).toBe("building");

      // Resolve macos
      macosResolve?.();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(manager.statuses.get("macos")).toBe("ready");
    });

    it("calls dev with correct context arguments", () => {
      const devFn = mock(() => Promise.resolve());
      const runtimes = [createMockRuntime("ios", devFn)];

      const config = createMockConfig();
      const manager = createBuildManager({
        config,
        runtimes,
        projectRoot: "/my/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      manager.triggerBuild("ios");

      expect(devFn).toHaveBeenCalledTimes(1);
      const calls = devFn.mock.calls as unknown as [Record<string, unknown>][];
      const callArgs = calls[0]![0];
      expect(callArgs.devUrl).toBe("http://localhost:5173");
      expect(callArgs.projectRoot).toBe("/my/project");
    });
  });

  describe("onStatusChange", () => {
    it("fires status change handlers when status updates", () => {
      const devFn = mock(() => new Promise<void>(() => {})); // never resolves
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      const handler = mock(() => {});
      manager.onStatusChange(handler);

      manager.triggerBuild("ios");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("ios", "building");
    });

    it("fires handler for each status transition", async () => {
      const devFn = mock(() => Promise.resolve());
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      const handler = mock(() => {});
      manager.onStatusChange(handler);

      manager.triggerBuild("ios");
      await new Promise((resolve) => setTimeout(resolve, 10));

      // building -> ready = 2 calls
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, "ios", "building");
      expect(handler).toHaveBeenNthCalledWith(2, "ios", "ready");
    });

    it("supports multiple handlers", () => {
      const devFn = mock(() => new Promise<void>(() => {}));
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      const handler1 = mock(() => {});
      const handler2 = mock(() => {});
      manager.onStatusChange(handler1);
      manager.onStatusChange(handler2);

      manager.triggerBuild("ios");

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("unsubscribes handlers correctly", () => {
      const devFn = mock(() => new Promise<void>(() => {}));
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      const handler = mock(() => {});
      const unsub = manager.onStatusChange(handler);
      unsub();

      manager.triggerBuild("ios");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("cancelAll", () => {
    it("clears all status change handlers", () => {
      const devFn = mock(() => new Promise<void>(() => {}));
      const runtimes = [createMockRuntime("ios", devFn)];

      const manager = createBuildManager({
        config: createMockConfig(),
        runtimes,
        projectRoot: "/fake/project",
        devUrlResolver: createMockDevUrlResolver("http://localhost:5173"),
      });

      const handler = mock(() => {});
      manager.onStatusChange(handler);
      manager.cancelAll();

      manager.triggerBuild("ios");

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
