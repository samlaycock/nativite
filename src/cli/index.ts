#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBuildCommand } from "./build-command.ts";
import { runInitCommand } from "./init-command.ts";

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

  // ─── nativite init ─────────────────────────────────────────────────────────

  program
    .command("init")
    .description("Prepare an existing Vite project for Nativite")
    .option("--force", "Overwrite nativite.config.ts if it already exists")
    .action(async (options: { force?: boolean }) => {
      const exitCode = await runInitCommand(options);
      if (exitCode !== 0) process.exit(exitCode);
    });

  return program;
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
