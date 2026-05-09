import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: {
      index: "./src/index.ts",
      "vite/index": "./src/vite/index.ts",
    },
    format: ["cjs", "esm"],
    platform: "neutral",
    external: [/^node:/],
    dts: true,
    outDir: "./dist",
    clean: true,
    outputOptions: {
      manualChunks(id) {
        if (
          id.includes("/src/platforms/") ||
          id.includes("/src/native/") ||
          id.includes("/src/plugins/")
        ) {
          return "registry";
        }
      },
    },
    copy: [
      "./src/globals.d.ts",
      {
        from: "./src/native/ios/runtime/*.swift",
        to: "./dist/runtime",
        flatten: true,
      },
      {
        from: "./src/native/android/runtime/*.kt",
        to: "./dist/runtime",
        flatten: true,
      },
      {
        from: "./src/native/android/assets/*.jar",
        to: "./dist/assets",
        flatten: true,
      },
    ],
  },
  {
    entry: {
      "cli/index": "./src/cli/index.ts",
    },
    format: ["cjs", "esm"],
    platform: "neutral",
    external: [/^node:/],
    dts: true,
    outDir: "./dist",
    clean: false,
  },
  {
    entry: {
      "client/index": "./src/client/index.ts",
      "chrome/public": "./src/chrome/public.ts",
      "css-vars/index": "./src/css-vars/index.ts",
      utils: "./src/utils.ts",
    },
    format: ["cjs", "esm"],
    platform: "browser",
    dts: true,
    outDir: "./dist",
    clean: false,
  },
]);
