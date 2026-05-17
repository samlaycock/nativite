import { nativite } from "nativite/vitest-browser-provider";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: nativite({ platform: "ios" }),
      instances: [{ browser: "ios" }],
    },
  },
});
