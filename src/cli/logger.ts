import type { LogLevel, LogType, Logger } from "vite";

import pc from "picocolors";

type TagColor = (text: string) => string;

const TAG_COLORS: Record<string, TagColor> = {
  vite: pc.cyan,
  ios: pc.magenta,
  macos: pc.blue,
  build: pc.yellow,
  nativite: pc.green,
};

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};

function formatTag(tag: string): string {
  const colorize = TAG_COLORS[tag] ?? pc.gray;
  const padded = `[${tag}]`.padEnd(10);
  return colorize(padded);
}

function formatTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return pc.dim(`${h}:${m}:${s}`);
}

export function createNativiteLogger(tag: string, level: LogLevel = "info"): Logger {
  const threshold = LOG_LEVELS[level];
  const loggedErrors = new WeakSet<object>();
  const warnedMessages = new Set<string>();
  let hasWarned = false;
  const prefix = formatTag(tag);

  function output(
    stream: NodeJS.WriteStream,
    logLevel: LogType,
    msg: string,
    options?: { clear?: boolean; timestamp?: boolean },
  ): void {
    if (LOG_LEVELS[logLevel] > threshold) return;
    if (options?.clear) {
      // Only clear if stdout is a TTY to avoid clobbering piped output.
      if (process.stdout.isTTY) {
        process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
      }
    }
    const ts = options?.timestamp ? `${formatTimestamp()} ` : "";
    stream.write(`${ts}${prefix} ${msg}\n`);
  }

  return {
    get hasWarned() {
      return hasWarned;
    },
    set hasWarned(value: boolean) {
      hasWarned = value;
    },

    info(msg, options) {
      output(process.stdout, "info", msg, options);
    },

    warn(msg, options) {
      hasWarned = true;
      output(process.stderr, "warn", pc.yellow(msg), options);
    },

    warnOnce(msg, options) {
      if (warnedMessages.has(msg)) return;
      warnedMessages.add(msg);
      hasWarned = true;
      output(process.stderr, "warn", pc.yellow(msg), options);
    },

    error(msg, options) {
      if (options?.error) {
        loggedErrors.add(options.error);
      }
      output(process.stderr, "error", pc.red(msg), options);
    },

    clearScreen(type) {
      if (LOG_LEVELS[type] > threshold) return;
      if (process.stdout.isTTY) {
        process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
      }
    },

    hasErrorLogged(error) {
      return loggedErrors.has(error);
    },
  };
}

export function printBanner(version: string): void {
  process.stdout.write(`\n  ${pc.green(pc.bold("nativite"))} ${pc.dim(`v${version}`)}\n\n`);
}

export function printServerUrls(
  urls: { local: string[]; network: string[] } | null,
  platform?: string,
  simulatorName?: string,
): void {
  if (!urls) return;

  const local = urls.local[0];
  const network = urls.network[0];

  if (local) {
    process.stdout.write(`  ${pc.dim(">")} Local:    ${pc.cyan(local)}\n`);
  }
  if (network) {
    process.stdout.write(`  ${pc.dim(">")} Network:  ${pc.cyan(network)}\n`);
  }
  if (platform) {
    const details = simulatorName ? `${platform} (${simulatorName})` : platform;
    process.stdout.write(`  ${pc.dim(">")} Platform: ${pc.magenta(details)}\n`);
  }

  process.stdout.write("\n");
}
