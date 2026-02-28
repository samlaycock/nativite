import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { createNativiteLogger, printBanner, printServerUrls } from "../logger.ts";
import { stripAnsi } from "./strip-ansi.ts";

let stdoutChunks: string[];
let stderrChunks: string[];
let stdoutSpy: ReturnType<typeof spyOn>;
let stderrSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  stdoutChunks = [];
  stderrChunks = [];
  stdoutSpy = spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  });
  stderrSpy = spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe("createNativiteLogger", () => {
  it("writes info messages to stdout", () => {
    const logger = createNativiteLogger("vite");
    logger.info("server started");
    expect(stdoutChunks.length).toBe(1);
    expect(stdoutChunks[0]).toContain("[vite]");
    expect(stdoutChunks[0]).toContain("server started");
    expect(stdoutChunks[0]).toEndWith("\n");
  });

  it("writes warn messages to stderr", () => {
    const logger = createNativiteLogger("ios");
    logger.warn("deprecated API");
    expect(stderrChunks.length).toBe(1);
    expect(stderrChunks[0]).toContain("[ios]");
    expect(stderrChunks[0]).toContain("deprecated API");
  });

  it("writes error messages to stderr", () => {
    const logger = createNativiteLogger("macos");
    logger.error("build failed");
    expect(stderrChunks.length).toBe(1);
    expect(stderrChunks[0]).toContain("[macos]");
    expect(stderrChunks[0]).toContain("build failed");
  });

  it("sets hasWarned after warn()", () => {
    const logger = createNativiteLogger("vite");
    expect(logger.hasWarned).toBe(false);
    logger.warn("some warning");
    expect(logger.hasWarned).toBe(true);
  });

  it("sets hasWarned after warnOnce()", () => {
    const logger = createNativiteLogger("vite");
    expect(logger.hasWarned).toBe(false);
    logger.warnOnce("once warning");
    expect(logger.hasWarned).toBe(true);
  });

  it("deduplicates warnOnce messages", () => {
    const logger = createNativiteLogger("vite");
    logger.warnOnce("duplicate warning");
    logger.warnOnce("duplicate warning");
    logger.warnOnce("duplicate warning");
    expect(stderrChunks.length).toBe(1);
  });

  it("tracks logged errors via hasErrorLogged", () => {
    const logger = createNativiteLogger("ios");
    const err = new Error("test error");
    expect(logger.hasErrorLogged(err)).toBe(false);
    logger.error("failed", { error: err });
    expect(logger.hasErrorLogged(err)).toBe(true);
  });

  it("does not track errors when no error option provided", () => {
    const logger = createNativiteLogger("ios");
    const err = new Error("test error");
    logger.error("failed");
    expect(logger.hasErrorLogged(err)).toBe(false);
  });

  it("suppresses info when level is warn", () => {
    const logger = createNativiteLogger("vite", "warn");
    logger.info("should be suppressed");
    logger.warn("should appear");
    expect(stdoutChunks.length).toBe(0);
    expect(stderrChunks.length).toBe(1);
  });

  it("suppresses info and warn when level is error", () => {
    const logger = createNativiteLogger("vite", "error");
    logger.info("suppressed");
    logger.warn("also suppressed");
    logger.error("visible");
    expect(stdoutChunks.length).toBe(0);
    expect(stderrChunks.length).toBe(1);
    expect(stderrChunks[0]).toContain("visible");
  });

  it("suppresses all output when level is silent", () => {
    const logger = createNativiteLogger("vite", "silent");
    logger.info("suppressed");
    logger.warn("suppressed");
    logger.error("suppressed");
    expect(stdoutChunks.length).toBe(0);
    expect(stderrChunks.length).toBe(0);
  });

  it("pads tags to uniform width", () => {
    const viteLogger = createNativiteLogger("vite");
    const macosLogger = createNativiteLogger("macos");

    viteLogger.info("test");
    macosLogger.info("test");

    // Both should have the same padded tag width before the message text
    const viteRaw = stripAnsi(stdoutChunks[0]!);
    const macosRaw = stripAnsi(stdoutChunks[1]!);

    // Tags are padded to 10 chars: "[vite]    " and "[macos]   "
    const viteTagEnd = viteRaw.indexOf("test");
    const macosTagEnd = macosRaw.indexOf("test");
    expect(viteTagEnd).toBe(macosTagEnd);
  });

  it("includes timestamp when option is set", () => {
    const logger = createNativiteLogger("vite");
    logger.info("with time", { timestamp: true });
    // Timestamp format is HH:MM:SS — look for the colon pattern
    const raw = stripAnsi(stdoutChunks[0]!);
    expect(raw).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

describe("printBanner", () => {
  it("prints version banner to stdout", () => {
    printBanner("0.1.0");
    expect(stdoutChunks.length).toBe(1);
    const raw = stripAnsi(stdoutChunks[0]!);
    expect(raw).toContain("nativite");
    expect(raw).toContain("v0.1.0");
  });
});

describe("printServerUrls", () => {
  it("prints local and network URLs", () => {
    printServerUrls({
      local: ["http://localhost:5173/"],
      network: ["http://192.168.1.5:5173/"],
    });
    const raw = stripAnsi(stdoutChunks.join(""));
    expect(raw).toContain("Local:");
    expect(raw).toContain("http://localhost:5173/");
    expect(raw).toContain("Network:");
    expect(raw).toContain("http://192.168.1.5:5173/");
  });

  it("prints platform info when provided", () => {
    printServerUrls({ local: ["http://localhost:5173/"], network: [] }, "ios", "iPhone 16 Pro");
    const raw = stripAnsi(stdoutChunks.join(""));
    expect(raw).toContain("Platform:");
    expect(raw).toContain("ios (iPhone 16 Pro)");
  });

  it("prints platform without simulator name", () => {
    printServerUrls({ local: ["http://localhost:5173/"], network: [] }, "macos");
    const raw = stripAnsi(stdoutChunks.join(""));
    expect(raw).toContain("Platform:");
    expect(raw).toContain("macos");
    expect(raw).not.toContain("(");
  });

  it("does nothing when urls is null", () => {
    printServerUrls(null);
    expect(stdoutChunks.length).toBe(0);
  });
});
