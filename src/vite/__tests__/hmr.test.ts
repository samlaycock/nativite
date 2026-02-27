import type { HotUpdateOptions } from "vite";

import { describe, expect, it } from "bun:test";

import { nativite } from "../index.ts";

function getHotUpdateHook() {
  const plugin = nativite().find((p) => p.name === "nativite");
  if (!plugin?.hotUpdate || typeof plugin.hotUpdate !== "function") {
    throw new Error("nativite core plugin hotUpdate hook is missing");
  }
  return (options: HotUpdateOptions) => {
    (plugin.hotUpdate as (this: unknown, opts: HotUpdateOptions) => unknown).call({}, options);
  };
}

function makeOptions(
  file: string,
  sentPayloads: Array<{ type: string; path?: string; triggeredBy?: string }>,
  overrides: Partial<HotUpdateOptions> = {},
): HotUpdateOptions {
  return {
    type: "update",
    file,
    timestamp: 123,
    modules: [{} as HotUpdateOptions["modules"][number]],
    read: () => "",
    server: {
      environments: {
        client: {
          hot: {
            send(payload: { type: string; path?: string; triggeredBy?: string }) {
              sentPayloads.push(payload);
            },
          },
        },
      },
    } as HotUpdateOptions["server"],
    ...overrides,
  };
}

describe("nativite core hotUpdate", () => {
  it("forces a client full-reload for native variant updates", () => {
    const hotUpdate = getHotUpdateHook();
    const sent: Array<{ type: string; path?: string; triggeredBy?: string }> = [];
    const options = makeOptions("/app/src/Button.native.tsx", sent);

    hotUpdate(options);

    expect(sent).toEqual([
      {
        type: "full-reload",
        path: "*",
        triggeredBy: "/app/src/Button.native.tsx",
      },
    ]);
  });

  it("dedupes full-reload broadcasts for the same change across environments", () => {
    const hotUpdate = getHotUpdateHook();
    const sent: Array<{ type: string; path?: string; triggeredBy?: string }> = [];
    const options = makeOptions("/app/src/Button.native.tsx", sent);

    hotUpdate(options);
    hotUpdate(options);
    hotUpdate(options);

    expect(sent).toHaveLength(1);
  });

  it("forces a reload for newly created native variants", () => {
    const hotUpdate = getHotUpdateHook();
    const sent: Array<{ type: string; path?: string; triggeredBy?: string }> = [];
    const options = makeOptions("/app/src/Button.native.tsx", sent, {
      type: "create",
      modules: [],
    });

    hotUpdate(options);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe("full-reload");
  });

  it("ignores non-native-variant files", () => {
    const hotUpdate = getHotUpdateHook();
    const sent: Array<{ type: string; path?: string; triggeredBy?: string }> = [];
    const options = makeOptions("/app/src/Button.tsx", sent);

    hotUpdate(options);

    expect(sent).toHaveLength(0);
  });
});
