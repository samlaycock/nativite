#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBuildCommand } from "./build-command.ts";
import { runDevCommand } from "./dev-command.ts";
import { runInitCommand } from "./init-command.ts";
import { runTestCommand } from "./test-command.ts";

// Read the version from package.json at runtime so the CLI always reports the
// version that was actually published, with no manual sync required.
const _require = createRequire(import.meta.url);
const { version } = _require("../../package.json") as { version: string };

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("nativite")
    .description("Nativite CLI — manage native platform builds")
    .version(version);

  // ─── nativite build ────────────────────────────────────────────────────────

  program
    .command("build")
    .description("Build configured platforms for production")
    .option("--platform <platform>", "Build only one configured platform")
    .action(async (options: { platform?: string }) => {
      const exitCode = await runBuildCommand(options);
      if (exitCode !== 0) process.exit(exitCode);
    });

  // ─── nativite dev ──────────────────────────────────────────────────────────

  program
    .command("dev")
    .description("Show optional native development status and next steps")
    .option("--url <url>", "Check a specific Vite dev server URL")
    .action(async (options: { url?: string }) => {
      const exitCode = await runDevCommand(options);
      if (exitCode !== 0) process.exit(exitCode);
    });

  // ─── nativite test ─────────────────────────────────────────────────────────

  program
    .command("test")
    .description("Run native-aware app tests through Vitest Browser Mode")
    .requiredOption("--platform <platform>", "Native platform to test (ios or android)")
    .option("--device <id>", "Simulator, emulator, or physical device id")
    .option("--watch", "Run Vitest in watch mode")
    .option("--test-url <url>", "WebView test URL loaded by the native harness")
    .option("--coordinator-port <port>", "Local coordinator port")
    .option("--artifacts-dir <path>", "Directory for native test artifacts")
    .option("--timeout <ms>", "Native harness launch timeout in milliseconds")
    .action(
      async (options: {
        platform?: string;
        device?: string;
        watch?: boolean;
        testUrl?: string;
        coordinatorPort?: string;
        artifactsDir?: string;
        timeout?: string;
      }) => {
        const exitCode = await runTestCommand(options);
        if (exitCode !== 0) process.exit(exitCode);
      },
    );

  // ─── nativite init ─────────────────────────────────────────────────────────

  program
    .command("init")
    .description("Prepare an existing Vite project for Nativite")
    .option("--force", "Overwrite nativite.config.ts if it already exists")
    .option(
      "--platform <platform>",
      "Add a first-party platform to nativite.config.ts (ios, macos, or android)",
      collectValues,
    )
    .action(async (options: { force?: boolean; platform?: readonly string[] }) => {
      const exitCode = await runInitCommand(options);
      if (exitCode !== 0) process.exit(exitCode);
    });

  return program;
}

function collectValues(value: string, previous: readonly string[] = []): readonly string[] {
  return [...previous, value];
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const program = createCliProgram();
  program.parse(process.argv);
}
