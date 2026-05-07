import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./src/index.ts", "./src/vite/index.ts", "./src/cli/index.ts"],
    format: ["cjs", "esm"],
    platform: "neutral",
    external: [/^node:/],
    dts: true,
    outDir: "./dist",
    clean: true,
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
    ],
  },
  {
    entry: [
      "./src/client/index.ts",
      "./src/chrome/public.ts",
      "./src/css-vars/index.ts",
      "./src/utils.ts",
    ],
    format: ["cjs", "esm"],
    platform: "browser",
    dts: true,
    outDir: "./dist",
    clean: false,
  },
]);
