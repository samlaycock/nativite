import type { CLIShortcut, ViteDevServer } from "vite";

import type { NativiteConfig, NativitePlatformPlugin } from "../index.ts";
import type { ResolvedNativitePlatformRuntime } from "../platforms/registry.ts";

import { resolveConfigForPlatform } from "../platforms/registry.ts";

interface ShortcutsContext {
  readonly config: NativiteConfig;
  readonly platform: string;
  readonly runtimes: ReadonlyArray<ResolvedNativitePlatformRuntime>;
  readonly simulatorName: string;
  readonly devUrl: string;
  readonly launchTarget: "simulator" | "device";
}

export function createNativiteShortcuts(ctx: ShortcutsContext): CLIShortcut<ViteDevServer>[] {
  const shortcuts: CLIShortcut<ViteDevServer>[] = [];

  const runtime = ctx.runtimes.find((r) => r.id === ctx.platform);
  if (runtime && typeof runtime.plugin.dev === "function") {
    shortcuts.push({
      key: "s",
      description: `rebuild and relaunch ${ctx.platform}`,
      async action(server) {
        const runtimeConfig = resolveConfigForPlatform(ctx.config, runtime.id);
        server.config.logger.info("Rebuilding...");
        await (runtime.plugin.dev as NonNullable<NativitePlatformPlugin["dev"]>)({
          rootConfig: ctx.config,
          config: runtimeConfig,
          projectRoot: server.config.root,
          platform: runtime.config,
          logger: server.config.logger,
          devUrl: ctx.devUrl,
          launchTarget: ctx.launchTarget,
          simulatorName: ctx.simulatorName,
        });
      },
    });
  }

  shortcuts.push({
    key: "b",
    description: "open in browser",
    action(server) {
      server.openBrowser();
    },
  });

  return shortcuts;
}
