import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: {
      index: "./src/index.ts",
      "vite/index": "./src/vite/index.ts",
      background: "./src/background.ts",
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
        from: "./src/plugins/calendar/ios/*.swift",
        to: "./dist/plugins/calendar/ios",
      },
      {
        from: "./src/plugins/calendar/android/*.kt",
        to: "./dist/plugins/calendar/android",
      },
      {
        from: "./src/plugins/contacts/ios/*.swift",
        to: "./dist/plugins/contacts/ios",
      },
      {
        from: "./src/plugins/contacts/android/*.kt",
        to: "./dist/plugins/contacts/android",
      },
      {
        from: "./src/plugins/notifications/ios/*.swift",
        to: "./dist/plugins/notifications/ios",
      },
      {
        from: "./src/plugins/notifications/android/*.kt",
        to: "./dist/plugins/notifications/android",
      },
      {
        from: "./src/plugins/secure-store/ios/*.swift",
        to: "./dist/plugins/secure-store/ios",
      },
      {
        from: "./src/plugins/secure-store/android/*.kt",
        to: "./dist/plugins/secure-store/android",
      },
      {
        from: "./src/plugins/local-auth/ios/*.swift",
        to: "./dist/plugins/local-auth/ios",
      },
      {
        from: "./src/plugins/local-auth/android/*.kt",
        to: "./dist/plugins/local-auth/android",
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
      "plugins/calendar/index": "./src/plugins/calendar/index.ts",
      "plugins/contacts/index": "./src/plugins/contacts/index.ts",
      "plugins/notifications/index": "./src/plugins/notifications/index.ts",
      "plugins/secure-store/index": "./src/plugins/secure-store/index.ts",
      "plugins/local-auth/index": "./src/plugins/local-auth/index.ts",
      utils: "./src/utils.ts",
    },
    format: ["cjs", "esm"],
    platform: "browser",
    dts: true,
    outDir: "./dist",
    clean: false,
  },
]);
