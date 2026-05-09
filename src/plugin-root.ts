import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NativitePluginRoot } from "./index.ts";

export function resolveNativitePluginRootDir(
  projectRoot: string,
  rootDir: NativitePluginRoot | undefined,
): string {
  if (rootDir instanceof URL) {
    const path = fileURLToPath(rootDir);
    return resolve(rootDir.href.endsWith("/") ? path : dirname(path));
  }

  return resolve(projectRoot, typeof rootDir === "string" && rootDir.length > 0 ? rootDir : ".");
}
