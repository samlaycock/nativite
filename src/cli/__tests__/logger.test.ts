import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { createNativiteLogger } from "../logger.ts";
import { stripAnsi } from "./strip-ansi.ts";

describe("createNativiteLogger", () => {
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

  it("exposes the tag property", () => {
    const logger = createNativiteLogger("ios");
    expect(logger.tag).toBe("ios");
  });

  it("exposes the tag property for arbitrary tags", () => {
    const logger = createNativiteLogger("android");
    expect(logger.tag).toBe("android");
  });

  describe("info", () => {
    it("writes to stdout", () => {
      const logger = createNativiteLogger("ios");
      logger.info("hello world");

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("includes the tag in the output", () => {
      const logger = createNativiteLogger("ios");
      logger.info("test message");

      const output = stripAnsi(stdoutSpy.mock.calls[0][0] as string);
      expect(output).toContain("[ios]");
    });

    it("includes the message in the output", () => {
      const logger = createNativiteLogger("ios");
      logger.info("my log message");

      const output = stripAnsi(stdoutSpy.mock.calls[0][0] as string);
      expect(output).toContain("my log message");
    });

    it("includes a timestamp in HH:MM:SS format", () => {
      const logger = createNativiteLogger("ios");
      logger.info("test");

      const output = stripAnsi(stdoutSpy.mock.calls[0][0] as string);
      expect(output).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it("ends with a newline", () => {
      const logger = createNativiteLogger("ios");
      logger.info("test");

      const output = stdoutSpy.mock.calls[0][0] as string;
      expect(output.endsWith("\n")).toBe(true);
    });
  });

  describe("warn", () => {
    it("writes to stderr", () => {
      const logger = createNativiteLogger("macos");
      logger.warn("caution");

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it("includes the tag in the output", () => {
      const logger = createNativiteLogger("macos");
      logger.warn("caution");

      const output = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(output).toContain("[macos]");
    });

    it("includes the message in the output", () => {
      const logger = createNativiteLogger("macos");
      logger.warn("something is off");

      const output = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(output).toContain("something is off");
    });

    it("includes a timestamp in HH:MM:SS format", () => {
      const logger = createNativiteLogger("macos");
      logger.warn("caution");

      const output = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(output).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("error", () => {
    it("writes to stderr", () => {
      const logger = createNativiteLogger("android");
      logger.error("failure");

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it("includes the tag in the output", () => {
      const logger = createNativiteLogger("android");
      logger.error("crash");

      const output = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(output).toContain("[android]");
    });

    it("includes the message in the output", () => {
      const logger = createNativiteLogger("android");
      logger.error("something broke");

      const output = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(output).toContain("something broke");
    });

    it("includes a timestamp in HH:MM:SS format", () => {
      const logger = createNativiteLogger("android");
      logger.error("failure");

      const output = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(output).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("tag formatting", () => {
    it("pads the tag to a fixed width", () => {
      const logger = createNativiteLogger("ios");
      logger.info("test");

      const output = stripAnsi(stdoutSpy.mock.calls[0][0] as string);
      // "[ios]" padded to 12 chars
      expect(output).toContain("[ios]       ");
    });

    it("uses a fallback color for unknown tags", () => {
      const logger = createNativiteLogger("custom");
      logger.info("test");

      // Should not throw; should write to stdout with the custom tag
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const output = stripAnsi(stdoutSpy.mock.calls[0][0] as string);
      expect(output).toContain("[custom]");
    });
  });
});
