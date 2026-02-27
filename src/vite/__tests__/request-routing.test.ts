import { describe, expect, it } from "bun:test";

import { shouldTransformNativeRequest } from "../request-routing.ts";

describe("native dev request routing", () => {
  it("bypasses direct static asset requests even when headers are ambiguous", () => {
    const shouldTransform = shouldTransformNativeRequest("/src/assets/react.svg", {
      accept: "*/*",
    });

    expect(shouldTransform).toBe(false);
  });

  it("allows Vite asset module imports to transform", () => {
    const shouldTransform = shouldTransformNativeRequest("/src/assets/react.svg?import", {
      "sec-fetch-dest": "script",
    });

    expect(shouldTransform).toBe(true);
  });

  it("treats explicit Vite module queries as transformable regardless of fetch destination", () => {
    const shouldTransform = shouldTransformNativeRequest("/src/assets/react.svg?import", {
      "sec-fetch-dest": "image",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    });

    expect(shouldTransform).toBe(true);
  });

  it("transforms bare static asset URLs when requested as module scripts", () => {
    const shouldTransform = shouldTransformNativeRequest("/src/assets/react.svg", {
      "sec-fetch-dest": "script",
      accept: "text/javascript, application/javascript, */*;q=0.8",
    });

    expect(shouldTransform).toBe(true);
  });

  it("bypasses static asset requests with cache-busting query params", () => {
    const shouldTransform = shouldTransformNativeRequest("/src/assets/react.svg?t=1739500000000", {
      accept: "*/*",
    });

    expect(shouldTransform).toBe(false);
  });

  it("keeps JavaScript module requests transformable", () => {
    const shouldTransform = shouldTransformNativeRequest("/src/main.tsx", {
      "sec-fetch-dest": "script",
    });

    expect(shouldTransform).toBe(true);
  });

  it("bypasses html document route requests when fetch metadata headers are absent", () => {
    const shouldTransform = shouldTransformNativeRequest("/sheet", {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    });

    expect(shouldTransform).toBe(false);
  });

  it("keeps Vite html-proxy module requests transformable", () => {
    const shouldTransform = shouldTransformNativeRequest("/index.html?html-proxy&index=0.js", {
      "sec-fetch-dest": "script",
    });

    expect(shouldTransform).toBe(true);
  });
});
