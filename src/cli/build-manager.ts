import type { NativiteConfig, NativitePlatformPlugin } from "../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../platforms/registry.ts";
import type { DevUrlResolver } from "./dev-url.ts";
import type { BuildStatus } from "./platform-table.ts";

import { resolveConfigForPlatform } from "../platforms/registry.ts";
import { createNativiteLogger } from "./logger.ts";

type StatusChangeHandler = (platformId: string, status: BuildStatus) => void;

export interface BuildManager {
  readonly statuses: ReadonlyMap<string, BuildStatus>;
  readonly onStatusChange: (handler: StatusChangeHandler) => () => void;
  readonly triggerBuild: (platformId: string) => void;
  readonly cancelAll: () => void;
}

interface BuildManagerOptions {
  readonly config: NativiteConfig;
  readonly runtimes: ReadonlyArray<ResolvedNativitePlatformRuntime>;
  readonly projectRoot: string;
  readonly devUrlResolver: DevUrlResolver;
}

export function createBuildManager(options: BuildManagerOptions): BuildManager {
  const { config, runtimes, projectRoot, devUrlResolver } = options;
  const statuses = new Map<string, BuildStatus>();
  const handlers = new Set<StatusChangeHandler>();

  for (const runtime of runtimes) {
    statuses.set(runtime.id, "idle");
  }

  function updateStatus(platformId: string, status: BuildStatus): void {
    statuses.set(platformId, status);
    for (const handler of handlers) {
      handler(platformId, status);
    }
  }

  function triggerBuild(platformId: string): void {
    const devUrl = devUrlResolver.url;
    if (!devUrl) return; // Can't build without a dev server URL

    if (statuses.get(platformId) === "building") return;

    const runtime = runtimes.find((r) => r.id === platformId);
    if (!runtime || typeof runtime.plugin.dev !== "function") return;

    updateStatus(platformId, "building");

    const platformConfig = resolveConfigForPlatform(config, platformId);
    const logger = createNativiteLogger(platformId);

    const dev = runtime.plugin.dev as NonNullable<NativitePlatformPlugin["dev"]>;
    Promise.resolve(
      dev({
        rootConfig: config,
        config: platformConfig,
        projectRoot,
        platform: runtime.config,
        logger,
        devUrl,
        launchTarget: platformConfig.dev?.target ?? "simulator",
        simulatorName: platformConfig.dev?.simulator ?? "iPhone 16 Pro",
      }),
    )
      .then(() => updateStatus(platformId, "ready"))
      .catch(() => updateStatus(platformId, "error"));
  }

  function onStatusChange(handler: StatusChangeHandler): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  function cancelAll(): void {
    handlers.clear();
  }

  return {
    statuses,
    onStatusChange,
    triggerBuild,
    cancelAll,
  };
}
