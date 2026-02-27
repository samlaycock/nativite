import type { HotUpdateOptions } from "vite";

import { describe, expect, it } from "bun:test";

import { nativite } from "../index.ts";

type SentHotPayload =
  | { type: "full-reload"; path?: string; triggeredBy?: string }
  | {
      type: "update";
      updates: Array<{
        type: "js-update" | "css-update";
        path: string;
        acceptedPath: string;
        timestamp: number;
        firstInvalidatedBy?: string;
      }>;
    };

function getHotUpdateHook() {
  const plugin = nativite().find((p) => p.name === "nativite");
  if (!plugin?.hotUpdate || typeof plugin.hotUpdate !== "function") {
    throw new Error("nativite core plugin hotUpdate hook is missing");
  }
  return (options: HotUpdateOptions) => {
    return (plugin.hotUpdate as (this: unknown, opts: HotUpdateOptions) => unknown).call(
      {},
      options,
    );
  };
}

function makeOptions(
  file: string,
  sentPayloads: SentHotPayload[],
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
              sentPayloads.push(payload as SentHotPayload);
            },
          },
        },
      },
    } as HotUpdateOptions["server"],
    ...overrides,
  };
}

describe("nativite core hotUpdate", () => {
  it("bridges native variant updates into client HMR update payloads", () => {
    const hotUpdate = getHotUpdateHook();
    const sent: SentHotPayload[] = [];
    const options = makeOptions("/app/src/Button.native.tsx", sent, {
      modules: [
        {
          url: "/src/Button.tsx",
          type: "js",
        } as HotUpdateOptions["modules"][number],
      ],
    });

    const result = hotUpdate(options);

    expect(result).toEqual([]);
    expect(sent).toEqual([
      {
        type: "update",
        updates: [
          {
            type: "js-update",
            path: "/src/Button.tsx",
            acceptedPath: "/src/Button.tsx",
            timestamp: 123,
            firstInvalidatedBy: "/app/src/Button.native.tsx",
          },
        ],
      },
    ]);
  });

  it("dedupes bridged native update payloads for the same change token", () => {
    const hotUpdate = getHotUpdateHook();
    const sent: SentHotPayload[] = [];
    const options = makeOptions("/app/src/Button.native.tsx", sent, {
      modules: [
        {
          url: "/src/Button.tsx",
          type: "js",
        } as HotUpdateOptions["modules"][number],
      ],
    });

    hotUpdate(options);
    hotUpdate(options);
    hotUpdate(options);

    expect(sent).toHaveLength(1);
  });

  it("includes canonical platformless paths for platform-extension module urls", () => {
    const hotUpdate = getHotUpdateHook();
    const sent: SentHotPayload[] = [];
    const options = makeOptions("/app/src/Button.native.tsx", sent, {
      modules: [
        {
          url: "/src/Button.native.tsx",
          type: "js",
        } as HotUpdateOptions["modules"][number],
      ],
    });

    hotUpdate(options);

    expect(sent).toHaveLength(1);
    if (sent[0]?.type !== "update") {
      throw new Error("expected update payload");
    }

    expect(sent[0].updates).toContainEqual({
      type: "js-update",
      path: "/src/Button.native.tsx",
      acceptedPath: "/src/Button.native.tsx",
      timestamp: 123,
      firstInvalidatedBy: "/app/src/Button.native.tsx",
    });
    expect(sent[0].updates).toContainEqual({
      type: "js-update",
      path: "/src/Button.tsx",
      acceptedPath: "/src/Button.tsx",
      timestamp: 123,
      firstInvalidatedBy: "/app/src/Button.native.tsx",
    });
  });

  it("keeps normal HMR handling for non-native-variant files", () => {
    const hotUpdate = getHotUpdateHook();
    const sent: SentHotPayload[] = [];
    const options = makeOptions("/app/src/Button.tsx", sent);

    const result = hotUpdate(options);

    expect(result).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});
