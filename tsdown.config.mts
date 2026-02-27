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
  },
  {
    entry: ["./src/client/index.ts", "./src/chrome/index.ts", "./src/css-vars/index.ts"],
    format: ["cjs", "esm"],
    platform: "browser",
    dts: true,
    outDir: "./dist",
    clean: false,
  },
]);
