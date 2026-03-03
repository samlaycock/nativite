import pc from "picocolors";

import type { SimulatorStatus } from "./status-poller.ts";

export type BuildStatus = "idle" | "building" | "ready" | "error";

export interface PlatformTableEntry {
  readonly id: string;
  readonly key: string;
  readonly buildStatus: BuildStatus;
  readonly simulatorStatus: SimulatorStatus;
}

// Keys reserved for global shortcuts (quit, help)
const RESERVED_KEYS = new Set(["q", "h"]);

export function assignHotkeys(
  platformIds: ReadonlyArray<string>,
): ReadonlyArray<{ readonly id: string; readonly key: string }> {
  const used = new Set(RESERVED_KEYS);

  return platformIds.map((id) => {
    for (const char of id) {
      if (!used.has(char)) {
        used.add(char);
        return { id, key: char };
      }
    }
    for (let i = 1; i <= 9; i++) {
      const key = String(i);
      if (!used.has(key)) {
        used.add(key);
        return { id, key };
      }
    }
    return { id, key: "?" };
  });
}

function formatBuildStatus(status: BuildStatus): string {
  switch (status) {
    case "idle":
      return pc.dim("--");
    case "building":
      return pc.yellow("building");
    case "ready":
      return pc.green("ready");
    case "error":
      return pc.red("error");
  }
}

function formatSimulatorStatus(status: SimulatorStatus): string {
  switch (status) {
    case "running":
      return pc.green("running");
    case "stopped":
      return pc.dim("stopped");
  }
}

interface RenderOptions {
  readonly version: string;
  readonly devUrl?: string;
}

export function renderPlatformTable(
  platforms: ReadonlyArray<PlatformTableEntry>,
  options: RenderOptions,
): string {
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push(`  ${pc.green(pc.bold("nativite"))} ${pc.dim(`v${options.version}`)}`);
  lines.push("");

  // Column widths
  const nameWidth = Math.max(12, ...platforms.map((p) => p.id.length));
  const buildWidth = 12;
  const simWidth = 12;

  // Column headers
  lines.push(
    `  ${pc.dim("Platform".padEnd(nameWidth))}  ${pc.dim("Build".padEnd(buildWidth))}  ${pc.dim("Simulator".padEnd(simWidth))}`,
  );

  // Rows
  for (const platform of platforms) {
    const name = platform.id.padEnd(nameWidth);
    const build = formatBuildStatus(platform.buildStatus);
    const sim = formatSimulatorStatus(platform.simulatorStatus);
    const key = `${pc.bold(platform.key)} + enter`;
    lines.push(`  ${name}  ${build.padEnd(buildWidth + 10)}  ${sim.padEnd(simWidth + 10)}  ${key}`);
  }

  // Footer
  lines.push("");
  if (options.devUrl) {
    lines.push(`  ${pc.dim("Dev server:")} ${pc.cyan(options.devUrl)}`);
  } else {
    lines.push(`  ${pc.dim("Dev server:")} ${pc.yellow("waiting for vite dev...")}`);
  }
  lines.push(`  ${pc.dim("press")} ${pc.bold("q + enter")} ${pc.dim("to quit")}`);
  lines.push("");

  return lines.join("\n");
}

let lastRenderedLineCount = 0;

export function printPlatformTable(
  platforms: ReadonlyArray<PlatformTableEntry>,
  options: RenderOptions,
): void {
  const table = renderPlatformTable(platforms, options);

  // Move cursor up and clear previous render
  if (lastRenderedLineCount > 0) {
    process.stdout.write(`\x1b[${lastRenderedLineCount}A`);
    for (let i = 0; i < lastRenderedLineCount; i++) {
      process.stdout.write("\x1b[2K\n");
    }
    process.stdout.write(`\x1b[${lastRenderedLineCount}A`);
  }

  process.stdout.write(table);
  lastRenderedLineCount = table.split("\n").length;
}

export function resetTableState(): void {
  lastRenderedLineCount = 0;
}
