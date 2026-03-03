import pc from "picocolors";

import type { NativitePlatformLogger } from "../index.ts";

type TagColor = (text: string) => string;

const TAG_COLORS: Record<string, TagColor> = {
  ios: pc.magenta,
  macos: pc.blue,
  android: pc.green,
  nativite: pc.cyan,
};

function formatTag(tag: string): string {
  const colorize = TAG_COLORS[tag] ?? pc.gray;
  const padded = `[${tag}]`.padEnd(12);
  return colorize(padded);
}

function formatTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return pc.dim(`${h}:${m}:${s}`);
}

export interface NativiteLogger extends NativitePlatformLogger {
  readonly tag: string;
}

export function createNativiteLogger(tag: string): NativiteLogger {
  const prefix = formatTag(tag);

  return {
    tag,

    info(msg: string) {
      const ts = `${formatTimestamp()} `;
      process.stdout.write(`${ts}${prefix} ${msg}\n`);
    },

    warn(msg: string) {
      const ts = `${formatTimestamp()} `;
      process.stderr.write(`${ts}${prefix} ${pc.yellow(msg)}\n`);
    },

    error(msg: string) {
      const ts = `${formatTimestamp()} `;
      process.stderr.write(`${ts}${prefix} ${pc.red(msg)}\n`);
    },
  };
}
