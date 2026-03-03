#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import pc from "picocolors";

import { resolveConfiguredPlatformRuntimes } from "../platforms/registry.ts";
import { createBuildManager } from "./build-manager.ts";
import { loadConfig } from "./config.ts";
import { createDevUrlResolver } from "./dev-url.ts";
import { createNativiteLogger } from "./logger.ts";
import {
  assignHotkeys,
  printPlatformTable,
  resetTableState,
  type PlatformTableEntry,
} from "./platform-table.ts";
import { createStatusPoller } from "./status-poller.ts";

// Read the version from package.json at runtime so the CLI always reports the
// version that was actually published, with no manual sync required.
const _require = createRequire(import.meta.url);
const { version } = _require("../../package.json") as { version: string };

const program = new Command();

program
  .name("nativite")
  .description("Nativite CLI — manage native platform dev builds")
  .version(version);

// ─── nativite dev ────────────────────────────────────────────────────────────

program
  .command("dev")
  .description("Start native platform dev build manager")
  .option("--url <url>", "Dev server URL (defaults to reading .nativite/dev.json)")
  .action(async (options: { url?: string }) => {
    const logger = createNativiteLogger("nativite");
    const cwd = process.cwd();

    let config;
    try {
      config = await loadConfig(cwd);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const runtimes = resolveConfiguredPlatformRuntimes(config);
    if (runtimes.length === 0) {
      logger.error("No platforms are configured.");
      process.exit(1);
    }

    const platformIds = runtimes.map((r) => r.id);
    const hotkeys = assignHotkeys(platformIds);
    const hotkeyMap = new Map(hotkeys.map((h) => [h.key, h.id]));

    // Dev URL resolution (--url flag or .nativite/dev.json)
    const devUrlResolver = createDevUrlResolver({
      url: options.url,
      projectRoot: cwd,
    });

    // Build manager
    const buildManager = createBuildManager({
      config,
      runtimes,
      projectRoot: cwd,
      devUrlResolver,
    });

    // Status poller for simulators/emulators
    const statusPoller = createStatusPoller({
      platformIds,
      appName: config.app.name,
    });

    // ── Table rendering ──

    function getTableEntries(): PlatformTableEntry[] {
      return hotkeys.map((h) => ({
        id: h.id,
        key: h.key,
        buildStatus: buildManager.statuses.get(h.id) ?? "idle",
        simulatorStatus: statusPoller.statuses.get(h.id) ?? "stopped",
      }));
    }

    function render(): void {
      printPlatformTable(getTableEntries(), {
        version,
        devUrl: devUrlResolver.url,
      });
    }

    // Initial render
    resetTableState();
    render();

    // Re-render on build status changes
    buildManager.onStatusChange(() => {
      render();
    });

    // Re-render on simulator status changes
    statusPoller.onStatusChange(() => {
      render();
    });

    // Re-render when dev URL resolves
    devUrlResolver.onResolved(() => {
      render();
    });

    // ── Readline input ──

    let rl: ReadlineInterface | undefined;
    if (process.stdin.isTTY && !process.env["CI"]) {
      rl = createInterface({ input: process.stdin });

      rl.on("line", (input) => {
        const trimmed = input.trim();
        if (!trimmed) return;

        if (trimmed === "q") {
          shutdown();
          return;
        }

        if (trimmed === "h") {
          // Print help below the table (will get overwritten on next re-render)
          const helpLines = [
            "",
            `  ${pc.bold("Shortcuts")}`,
            ...hotkeys.map(
              (h) =>
                `  ${pc.dim("press")} ${pc.bold(`${h.key} + enter`)} ${pc.dim(`to build ${h.id}`)}`,
            ),
            `  ${pc.dim("press")} ${pc.bold("q + enter")} ${pc.dim("to quit")}`,
            "",
          ];
          process.stdout.write(helpLines.join("\n"));
          return;
        }

        const platformId = hotkeyMap.get(trimmed);
        if (platformId) {
          if (!devUrlResolver.url) {
            logger.warn("Cannot build — dev server URL not available yet. Start vite dev first.");
            return;
          }
          buildManager.triggerBuild(platformId);
        }
      });
    }

    // ── Graceful shutdown ──

    const shutdown = () => {
      rl?.close();
      statusPoller.close();
      devUrlResolver.close();
      buildManager.cancelAll();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program.parse(process.argv);
