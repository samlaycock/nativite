import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import {
  assignHotkeys,
  printPlatformTable,
  renderPlatformTable,
  resetTableState,
  type PlatformTableEntry,
} from "../platform-table.ts";
import { stripAnsi } from "./strip-ansi.ts";

describe("assignHotkeys", () => {
  it("assigns the first unique character per platform", () => {
    const result = assignHotkeys(["ios", "macos", "android"]);

    expect(result).toEqual([
      { id: "ios", key: "i" },
      { id: "macos", key: "m" },
      { id: "android", key: "a" },
    ]);
  });

  it("skips reserved keys (q, h)", () => {
    // "quark" starts with 'q' which is reserved, so it should skip to 'u'
    // "hero" starts with 'h' which is reserved, so it should skip to 'e'
    const result = assignHotkeys(["quark", "hero"]);

    expect(result[0]!.key).not.toBe("q");
    expect(result[0]!.key).toBe("u");
    expect(result[1]!.key).not.toBe("h");
    expect(result[1]!.key).toBe("e");
  });

  it("falls back to numbers when characters collide", () => {
    // All platforms start with the same characters
    const result = assignHotkeys(["aaa", "aab", "aac"]);

    // "aaa" gets 'a', "aab" gets 'b' (from second unique char), "aac" gets 'c'
    expect(result[0]!.key).toBe("a");
    expect(result[1]!.key).toBe("b");
    expect(result[2]!.key).toBe("c");
  });

  it("falls back to numbers when all characters are exhausted", () => {
    // "a" gets 'a', "a" has no unique chars left -> falls back to number
    const result = assignHotkeys(["a", "a"]);

    expect(result[0]!.key).toBe("a");
    expect(result[1]!.key).toBe("1");
  });

  it("returns ? when all keys are exhausted", () => {
    // Create enough platforms to exhaust all single chars and numbers 1-9
    const platforms = Array.from({ length: 36 }, (_, i) => String.fromCharCode(97 + (i % 26)));
    const result = assignHotkeys(platforms);

    // The last items that can't get a key should get "?"
    const questionMarks = result.filter((r) => r.key === "?");
    expect(questionMarks.length).toBeGreaterThan(0);
  });

  it("handles an empty list", () => {
    const result = assignHotkeys([]);
    expect(result).toEqual([]);
  });

  it("handles a single platform", () => {
    const result = assignHotkeys(["ios"]);
    expect(result).toEqual([{ id: "ios", key: "i" }]);
  });
});

describe("renderPlatformTable", () => {
  const basePlatforms: ReadonlyArray<PlatformTableEntry> = [
    { id: "ios", key: "i", buildStatus: "idle", simulatorStatus: "stopped" },
    { id: "macos", key: "m", buildStatus: "ready", simulatorStatus: "running" },
  ];

  it("includes the Platform column header", () => {
    const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "1.0.0" }));
    expect(output).toContain("Platform");
  });

  it("includes the Build column header", () => {
    const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "1.0.0" }));
    expect(output).toContain("Build");
  });

  it("includes the Simulator column header", () => {
    const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "1.0.0" }));
    expect(output).toContain("Simulator");
  });

  it("includes platform ids in the rows", () => {
    const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "1.0.0" }));
    expect(output).toContain("ios");
    expect(output).toContain("macos");
  });

  it("includes the version in the header", () => {
    const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "2.5.0" }));
    expect(output).toContain("v2.5.0");
  });

  it("includes the nativite branding", () => {
    const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "1.0.0" }));
    expect(output).toContain("nativite");
  });

  describe("build status formatting", () => {
    it("formats idle build status as --", () => {
      const platforms: ReadonlyArray<PlatformTableEntry> = [
        { id: "ios", key: "i", buildStatus: "idle", simulatorStatus: "stopped" },
      ];
      const output = stripAnsi(renderPlatformTable(platforms, { version: "1.0.0" }));
      expect(output).toContain("--");
    });

    it("formats building build status", () => {
      const platforms: ReadonlyArray<PlatformTableEntry> = [
        { id: "ios", key: "i", buildStatus: "building", simulatorStatus: "stopped" },
      ];
      const output = stripAnsi(renderPlatformTable(platforms, { version: "1.0.0" }));
      expect(output).toContain("building");
    });

    it("formats ready build status", () => {
      const platforms: ReadonlyArray<PlatformTableEntry> = [
        { id: "ios", key: "i", buildStatus: "ready", simulatorStatus: "stopped" },
      ];
      const output = stripAnsi(renderPlatformTable(platforms, { version: "1.0.0" }));
      expect(output).toContain("ready");
    });

    it("formats error build status", () => {
      const platforms: ReadonlyArray<PlatformTableEntry> = [
        { id: "ios", key: "i", buildStatus: "error", simulatorStatus: "stopped" },
      ];
      const output = stripAnsi(renderPlatformTable(platforms, { version: "1.0.0" }));
      expect(output).toContain("error");
    });
  });

  describe("simulator status formatting", () => {
    it("formats running simulator status", () => {
      const platforms: ReadonlyArray<PlatformTableEntry> = [
        { id: "ios", key: "i", buildStatus: "idle", simulatorStatus: "running" },
      ];
      const output = stripAnsi(renderPlatformTable(platforms, { version: "1.0.0" }));
      expect(output).toContain("running");
    });

    it("formats stopped simulator status", () => {
      const platforms: ReadonlyArray<PlatformTableEntry> = [
        { id: "ios", key: "i", buildStatus: "idle", simulatorStatus: "stopped" },
      ];
      const output = stripAnsi(renderPlatformTable(platforms, { version: "1.0.0" }));
      expect(output).toContain("stopped");
    });
  });

  describe("dev URL display", () => {
    it("shows dev URL when available", () => {
      const output = stripAnsi(
        renderPlatformTable(basePlatforms, {
          version: "1.0.0",
          devUrl: "http://localhost:5173",
        }),
      );
      expect(output).toContain("http://localhost:5173");
      expect(output).toContain("Dev server:");
    });

    it("shows waiting message when no URL is available", () => {
      const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "1.0.0" }));
      expect(output).toContain("waiting for vite dev...");
    });
  });

  it("includes hotkey instructions for each platform row", () => {
    const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "1.0.0" }));
    expect(output).toContain("i + enter");
    expect(output).toContain("m + enter");
  });

  it("includes quit instruction", () => {
    const output = stripAnsi(renderPlatformTable(basePlatforms, { version: "1.0.0" }));
    expect(output).toContain("q + enter");
    expect(output).toContain("quit");
  });
});

describe("printPlatformTable", () => {
  let stdoutSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    stdoutSpy = spyOn(process.stdout, "write").mockReturnValue(true);
    resetTableState();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("writes the table to stdout", () => {
    const platforms: ReadonlyArray<PlatformTableEntry> = [
      { id: "ios", key: "i", buildStatus: "idle", simulatorStatus: "stopped" },
    ];

    printPlatformTable(platforms, { version: "1.0.0" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join("");
    const stripped = stripAnsi(output);
    expect(stripped).toContain("ios");
    expect(stripped).toContain("nativite");
  });

  it("clears previous output on subsequent calls", () => {
    const platforms: ReadonlyArray<PlatformTableEntry> = [
      { id: "ios", key: "i", buildStatus: "idle", simulatorStatus: "stopped" },
    ];

    printPlatformTable(platforms, { version: "1.0.0" });
    const firstCallCount = stdoutSpy.mock.calls.length;

    printPlatformTable(platforms, { version: "1.0.0" });
    const secondCallCount = stdoutSpy.mock.calls.length;

    // Second call should have more writes (cursor movement + clear + table)
    expect(secondCallCount).toBeGreaterThan(firstCallCount);
  });
});
