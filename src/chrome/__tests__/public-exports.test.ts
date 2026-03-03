import { describe, expect, it } from "bun:test";

import * as chromePublic from "../public.ts";

describe("nativite/chrome public exports", () => {
  it("exports the core chrome APIs", () => {
    expect(typeof chromePublic.chrome).toBe("function");
    expect(typeof chromePublic.titleBar).toBe("function");
    expect(typeof chromePublic.navigation).toBe("function");
    expect(typeof chromePublic.sheet).toBe("function");
  });

  it("does not export item constructors", () => {
    const api = chromePublic as Record<string, unknown>;
    expect(api["button"]).toBeUndefined();
    expect(api["navItem"]).toBeUndefined();
    expect(api["menuItem"]).toBeUndefined();
  });

  it("does not export test helpers", () => {
    const api = chromePublic as Record<string, unknown>;
    expect(api["_handleIncoming"]).toBeUndefined();
    expect(api["_resetChromeState"]).toBeUndefined();
    expect(api["_drainFlush"]).toBeUndefined();
  });
});
