import { readFileSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

interface DevJson {
  readonly devURL: string;
}

type ResolvedHandler = (url: string) => void;

export interface DevUrlResolver {
  readonly url: string | undefined;
  readonly onResolved: (handler: ResolvedHandler) => () => void;
  readonly close: () => void;
}

interface DevUrlResolverOptions {
  readonly url?: string;
  readonly projectRoot: string;
}

function tryReadDevJson(projectRoot: string): string | undefined {
  try {
    const raw = readFileSync(join(projectRoot, ".nativite", "dev.json"), "utf-8");
    const parsed = JSON.parse(raw) as DevJson;
    if (typeof parsed.devURL === "string" && parsed.devURL.length > 0) {
      return parsed.devURL;
    }
  } catch {
    // File doesn't exist or is invalid — not ready yet
  }
  return undefined;
}

export function createDevUrlResolver(options: DevUrlResolverOptions): DevUrlResolver {
  const { projectRoot } = options;
  const handlers = new Set<ResolvedHandler>();
  let resolvedUrl: string | undefined = options.url;
  let watcher: FSWatcher | undefined;
  let pollInterval: ReturnType<typeof setInterval> | undefined;

  function notifyHandlers(url: string): void {
    for (const handler of handlers) {
      handler(url);
    }
  }

  // If --url was provided, we're done immediately.
  // Otherwise, watch for .nativite/dev.json.
  if (!resolvedUrl) {
    // Try reading immediately in case vite dev is already running
    resolvedUrl = tryReadDevJson(projectRoot);

    if (!resolvedUrl) {
      const nativiteDir = join(projectRoot, ".nativite");

      // Use fs.watch on the .nativite directory if it exists,
      // otherwise poll for the file at a short interval.
      try {
        watcher = watch(nativiteDir, (_event, filename) => {
          if (filename === "dev.json" && !resolvedUrl) {
            const url = tryReadDevJson(projectRoot);
            if (url) {
              resolvedUrl = url;
              notifyHandlers(url);
              watcher?.close();
              watcher = undefined;
            }
          }
        });
      } catch {
        // Directory doesn't exist yet — fall back to polling
        pollInterval = setInterval(() => {
          const url = tryReadDevJson(projectRoot);
          if (url) {
            resolvedUrl = url;
            notifyHandlers(url);
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = undefined;
            }
          }
        }, 1000);
      }
    }
  }

  function onResolved(handler: ResolvedHandler): () => void {
    // If already resolved, fire immediately
    if (resolvedUrl) {
      handler(resolvedUrl);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  function close(): void {
    watcher?.close();
    watcher = undefined;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = undefined;
    }
    handlers.clear();
  }

  return {
    get url() {
      return resolvedUrl;
    },
    onResolved,
    close,
  };
}
