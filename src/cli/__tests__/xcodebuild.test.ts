import { describe, expect, it } from "bun:test";

import { formatXcodebuildEvent, parseXcodebuildLine } from "../xcodebuild.ts";
import { stripAnsi } from "./strip-ansi.ts";

describe("parseXcodebuildLine", () => {
  it("parses CompileC events", () => {
    const event = parseXcodebuildLine(
      "CompileC /tmp/build/AppDelegate.o /Users/dev/project/AppDelegate.swift normal arm64",
    );
    expect(event.type).toBe("compile");
    if (event.type === "compile") {
      expect(event.file).toBe("AppDelegate.o");
    }
  });

  it("parses CompileSwift events", () => {
    const event = parseXcodebuildLine(
      "CompileSwift normal arm64 /Users/dev/project/ViewController.swift",
    );
    expect(event.type).toBe("compile");
    if (event.type === "compile") {
      expect(event.file).toBe("normal");
    }
  });

  it("parses CompileSwiftSources events", () => {
    const event = parseXcodebuildLine(
      "CompileSwiftSources normal arm64 com.apple.xcode.tools.swift.compiler",
    );
    expect(event.type).toBe("compile");
  });

  it("parses Ld events", () => {
    const event = parseXcodebuildLine(
      "Ld /tmp/nativite-build-com.example.app/MyApp.app/MyApp normal arm64",
    );
    expect(event.type).toBe("link");
    if (event.type === "link") {
      expect(event.target).toBe("MyApp");
    }
  });

  it("parses CodeSign events", () => {
    const event = parseXcodebuildLine("CodeSign /tmp/nativite-build-com.example.app/MyApp.app");
    expect(event.type).toBe("codesign");
  });

  it("parses error diagnostics", () => {
    const event = parseXcodebuildLine(
      "/Users/dev/project/ViewController.swift:42:10: error: Cannot convert value of type 'String' to expected type 'Int'",
    );
    expect(event.type).toBe("error");
    if (event.type === "error") {
      expect(event.file).toBe("/Users/dev/project/ViewController.swift");
      expect(event.line).toBe(42);
      expect(event.col).toBe(10);
      expect(event.message).toBe("Cannot convert value of type 'String' to expected type 'Int'");
    }
  });

  it("parses warning diagnostics", () => {
    const event = parseXcodebuildLine(
      "/Users/dev/project/AppDelegate.swift:15:9: warning: variable 'x' was never used",
    );
    expect(event.type).toBe("warning");
    if (event.type === "warning") {
      expect(event.file).toBe("/Users/dev/project/AppDelegate.swift");
      expect(event.line).toBe(15);
      expect(event.col).toBe(9);
      expect(event.message).toBe("variable 'x' was never used");
    }
  });

  it("parses BUILD SUCCEEDED", () => {
    const event = parseXcodebuildLine("** BUILD SUCCEEDED **");
    expect(event.type).toBe("success");
  });

  it("parses BUILD FAILED", () => {
    const event = parseXcodebuildLine("** BUILD FAILED **");
    expect(event.type).toBe("failure");
  });

  it("returns other for unrecognized lines", () => {
    const event = parseXcodebuildLine("note: Using new build system");
    expect(event.type).toBe("other");
    if (event.type === "other") {
      expect(event.raw).toBe("note: Using new build system");
    }
  });

  it("returns other for empty lines", () => {
    const event = parseXcodebuildLine("");
    expect(event.type).toBe("other");
  });

  it("returns other for whitespace-only lines", () => {
    const event = parseXcodebuildLine("   ");
    expect(event.type).toBe("other");
  });
});

describe("formatXcodebuildEvent", () => {
  it("formats compile events", () => {
    const result = formatXcodebuildEvent({ type: "compile", file: "ViewController.swift" });
    expect(result).toBeDefined();
    expect(stripAnsi(result!)).toBe("Compiling ViewController.swift");
  });

  it("formats link events", () => {
    const result = formatXcodebuildEvent({ type: "link", target: "MyApp" });
    expect(result).toBeDefined();
    expect(stripAnsi(result!)).toBe("Linking MyApp");
  });

  it("formats codesign events", () => {
    const result = formatXcodebuildEvent({ type: "codesign" });
    expect(result).toBe("Signing...");
  });

  it("formats error diagnostics with file location", () => {
    const result = formatXcodebuildEvent({
      type: "error",
      file: "/Users/dev/project/ViewController.swift",
      line: 42,
      col: 10,
      message: "type mismatch",
    });
    expect(result).toBeDefined();
    const raw = stripAnsi(result!);
    expect(raw).toContain("error:");
    expect(raw).toContain("type mismatch");
    expect(raw).toContain("ViewController.swift:42:10");
  });

  it("formats warning diagnostics with file location", () => {
    const result = formatXcodebuildEvent({
      type: "warning",
      file: "/Users/dev/project/AppDelegate.swift",
      line: 15,
      col: 9,
      message: "unused variable",
    });
    expect(result).toBeDefined();
    const raw = stripAnsi(result!);
    expect(raw).toContain("warning:");
    expect(raw).toContain("unused variable");
    expect(raw).toContain("AppDelegate.swift:15:9");
  });

  it("returns undefined for success events", () => {
    expect(formatXcodebuildEvent({ type: "success" })).toBeUndefined();
  });

  it("returns undefined for failure events", () => {
    expect(formatXcodebuildEvent({ type: "failure" })).toBeUndefined();
  });

  it("returns undefined for other events", () => {
    expect(formatXcodebuildEvent({ type: "other", raw: "note: foo" })).toBeUndefined();
  });
});
