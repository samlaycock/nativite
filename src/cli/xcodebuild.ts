import { spawn as nodeSpawn } from "node:child_process";
import { basename } from "node:path";
import pc from "picocolors";

import type { NativitePlatformLogger } from "../index.ts";

// ─── Event types ─────────────────────────────────────────────────────────────

interface CompileEvent {
  readonly type: "compile";
  readonly file: string;
}

interface LinkEvent {
  readonly type: "link";
  readonly target: string;
}

interface CodesignEvent {
  readonly type: "codesign";
}

interface DiagnosticEvent {
  readonly type: "error" | "warning";
  readonly file: string;
  readonly line: number;
  readonly col: number;
  readonly message: string;
}

interface SuccessEvent {
  readonly type: "success";
}

interface FailureEvent {
  readonly type: "failure";
}

interface OtherEvent {
  readonly type: "other";
  readonly raw: string;
}

export type XcodebuildEvent =
  | CompileEvent
  | LinkEvent
  | CodesignEvent
  | DiagnosticEvent
  | SuccessEvent
  | FailureEvent
  | OtherEvent;

// ─── Parser ──────────────────────────────────────────────────────────────────

const COMPILE_RE = /^(?:CompileC|CompileSwift|CompileSwiftSources)\s+(.+)/;
const LINK_RE = /^Ld\s+(\S+)/;
const CODESIGN_RE = /^CodeSign\s/;
const DIAGNOSTIC_RE = /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.+)/;
const BUILD_SUCCEEDED_RE = /^\*\*\s*BUILD SUCCEEDED\s*\*\*/;
const BUILD_FAILED_RE = /^\*\*\s*BUILD FAILED\s*\*\*/;

export function parseXcodebuildLine(line: string): XcodebuildEvent {
  const trimmed = line.trim();
  if (!trimmed) return { type: "other", raw: line };

  const diagnosticMatch = trimmed.match(DIAGNOSTIC_RE);
  if (diagnosticMatch) {
    return {
      type: diagnosticMatch[4] === "error" ? "error" : "warning",
      file: diagnosticMatch[1]!,
      line: Number(diagnosticMatch[2]),
      col: Number(diagnosticMatch[3]),
      message: diagnosticMatch[5]!,
    };
  }

  if (BUILD_SUCCEEDED_RE.test(trimmed)) return { type: "success" };
  if (BUILD_FAILED_RE.test(trimmed)) return { type: "failure" };

  const compileMatch = trimmed.match(COMPILE_RE);
  if (compileMatch) {
    // Extract the filename from the full path — the first token is the source file
    const firstToken = compileMatch[1]!.split(/\s+/)[0]!;
    return { type: "compile", file: basename(firstToken) };
  }

  const linkMatch = trimmed.match(LINK_RE);
  if (linkMatch) {
    return { type: "link", target: basename(linkMatch[1]!) };
  }

  if (CODESIGN_RE.test(trimmed)) return { type: "codesign" };

  return { type: "other", raw: line };
}

// ─── Formatter ───────────────────────────────────────────────────────────────

export function formatXcodebuildEvent(event: XcodebuildEvent): string | undefined {
  switch (event.type) {
    case "compile":
      return `Compiling ${pc.bold(event.file)}`;
    case "link":
      return `Linking ${pc.bold(event.target)}`;
    case "codesign":
      return "Signing...";
    case "error":
      return `${pc.red("error:")} ${event.message}\n  ${pc.dim(`${basename(event.file)}:${event.line}:${event.col}`)}`;
    case "warning":
      return `${pc.yellow("warning:")} ${event.message}\n  ${pc.dim(`${basename(event.file)}:${event.line}:${event.col}`)}`;
    case "success":
      return undefined;
    case "failure":
      return undefined;
    case "other":
      return undefined;
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

interface RunXcodebuildOptions {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly logger: NativitePlatformLogger;
}

export function runXcodebuild(options: RunXcodebuildOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const child = nodeSpawn("xcodebuild", options.args as string[], {
      cwd: options.cwd,
      stdio: "pipe",
    });

    let stderrBuffer = "";
    let hasFailed = false;
    const diagnostics: string[] = [];

    function processLine(line: string): void {
      const event = parseXcodebuildLine(line);
      if (event.type === "failure") {
        hasFailed = true;
        return;
      }
      if (event.type === "success") return;

      const formatted = formatXcodebuildEvent(event);
      if (!formatted) return;

      if (event.type === "error" || event.type === "warning") {
        diagnostics.push(formatted);
      } else {
        options.logger.info(formatted);
      }
    }

    let stdoutBuffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += String(chunk);
      const lines = stdoutBuffer.split("\n");
      // Keep the last incomplete line in the buffer
      stdoutBuffer = lines.pop()!;
      for (const line of lines) {
        processLine(line);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += String(chunk);
    });

    child.on("close", (code) => {
      // Process any remaining buffered output
      if (stdoutBuffer.trim()) {
        processLine(stdoutBuffer);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (code === 0 && !hasFailed) {
        if (diagnostics.length > 0) {
          for (const diag of diagnostics) {
            options.logger.warn(diag);
          }
        }
        options.logger.info(`Build succeeded ${pc.dim(`(${elapsed}s)`)}`);
        resolve();
      } else {
        for (const diag of diagnostics) {
          options.logger.error(diag);
        }
        const stderrTrimmed = stderrBuffer.trim();
        if (stderrTrimmed && diagnostics.length === 0) {
          options.logger.error(stderrTrimmed);
        }
        reject(new Error(`xcodebuild failed (exit code ${code ?? "unknown"}, ${elapsed}s)`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn xcodebuild: ${err.message}`));
    });
  });
}
