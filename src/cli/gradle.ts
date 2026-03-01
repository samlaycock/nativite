import { spawn as nodeSpawn } from "node:child_process";
import { join } from "node:path";
import pc from "picocolors";

import type { NativitePlatformLogger } from "../index.ts";

// ─── Event types ─────────────────────────────────────────────────────────────

interface CompileEvent {
  readonly type: "compile";
  readonly task: string;
}

interface DiagnosticEvent {
  readonly type: "error" | "warning";
  readonly message: string;
}

interface SuccessEvent {
  readonly type: "success";
}

interface FailureEvent {
  readonly type: "failure";
  readonly message: string;
}

interface OtherEvent {
  readonly type: "other";
  readonly raw: string;
}

export type GradleEvent = CompileEvent | DiagnosticEvent | SuccessEvent | FailureEvent | OtherEvent;

// ─── Parser ──────────────────────────────────────────────────────────────────

const TASK_RE = /^> Task (:\S+)/;
const ERROR_RE = /^e:\s+(.+)/;
const WARNING_RE = /^w:\s+(.+)/;
const BUILD_SUCCESSFUL_RE = /^BUILD SUCCESSFUL/;
const BUILD_FAILED_RE = /^BUILD FAILED/;
const FAILURE_RE = /^FAILURE:\s+(.+)/;

export function parseGradleLine(line: string): GradleEvent {
  const trimmed = line.trim();
  if (!trimmed) return { type: "other", raw: line };

  const errorMatch = trimmed.match(ERROR_RE);
  if (errorMatch) {
    return { type: "error", message: errorMatch[1]! };
  }

  const warningMatch = trimmed.match(WARNING_RE);
  if (warningMatch) {
    return { type: "warning", message: warningMatch[1]! };
  }

  if (BUILD_SUCCESSFUL_RE.test(trimmed)) return { type: "success" };

  const failureMatch = trimmed.match(FAILURE_RE);
  if (failureMatch) {
    return { type: "failure", message: failureMatch[1]! };
  }
  if (BUILD_FAILED_RE.test(trimmed)) {
    return { type: "failure", message: "Build failed" };
  }

  const taskMatch = trimmed.match(TASK_RE);
  if (taskMatch) {
    return { type: "compile", task: taskMatch[1]! };
  }

  return { type: "other", raw: line };
}

// ─── Formatter ───────────────────────────────────────────────────────────────

export function formatGradleEvent(event: GradleEvent): string | undefined {
  switch (event.type) {
    case "compile":
      return `${pc.bold(event.task)}`;
    case "error":
      return `${pc.red("error:")} ${event.message}`;
    case "warning":
      return `${pc.yellow("warning:")} ${event.message}`;
    case "success":
      return undefined;
    case "failure":
      return undefined;
    case "other":
      return undefined;
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

interface RunGradleOptions {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly logger: NativitePlatformLogger;
}

export function runGradle(options: RunGradleOptions): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const startTime = Date.now();
    const gradlew =
      process.platform === "win32"
        ? join(options.cwd, "gradlew.bat")
        : join(options.cwd, "gradlew");

    const child = nodeSpawn(gradlew, options.args as string[], {
      cwd: options.cwd,
      stdio: "pipe",
    });

    let stderrBuffer = "";
    let hasFailed = false;
    const diagnostics: string[] = [];

    function processLine(line: string): void {
      const event = parseGradleLine(line);
      if (event.type === "failure") {
        hasFailed = true;
        return;
      }
      if (event.type === "success") return;

      const formatted = formatGradleEvent(event);
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
      stdoutBuffer = lines.pop()!;
      for (const line of lines) {
        processLine(line);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += String(chunk);
    });

    child.on("close", (code) => {
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
        resolvePromise();
      } else {
        for (const diag of diagnostics) {
          options.logger.error(diag);
        }
        const stderrTrimmed = stderrBuffer.trim();
        if (stderrTrimmed && diagnostics.length === 0) {
          options.logger.error(stderrTrimmed);
        }
        reject(new Error(`Gradle build failed (exit code ${code ?? "unknown"}, ${elapsed}s)`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Gradle wrapper: ${err.message}`));
    });
  });
}
