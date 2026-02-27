import type { NativiteConfig } from "../index.ts";

/**
 * Minimal valid config — every required field present, all optionals absent.
 * Shared across test files to keep tests DRY.
 */
export const baseConfig: NativiteConfig = {
  app: {
    name: "TestApp",
    bundleId: "com.example.testapp",
    version: "1.0.0",
    buildNumber: 1,
    platforms: {
      ios: { minimumVersion: "17.0" },
    },
  },
};

/** Config with a splash screen (color only, no image). */
export const splashColorConfig: NativiteConfig = {
  ...baseConfig,
  splash: {
    backgroundColor: "#1A2B3C",
  },
};

/** Config with a full splash screen (color + image path). */
export const splashImageConfig: NativiteConfig = {
  ...baseConfig,
  splash: {
    backgroundColor: "#FF0000",
    image: "assets/logo.png",
  },
};

/** Config with OTA updates enabled. */
export const otaConfig: NativiteConfig = {
  ...baseConfig,
  updates: {
    url: "https://updates.example.com",
    channel: "production",
  },
};

/** Config with signing info. */
export const signedConfig: NativiteConfig = {
  ...baseConfig,
  signing: {
    ios: { mode: "automatic", teamId: "ABCDE12345" },
  },
};

/** Config with multiple plugins in non-sorted order. */
export const pluginsUnsortedConfig: NativiteConfig = {
  ...baseConfig,
  plugins: [{ name: "zebra-plugin" }, { name: "alpha-plugin" }, { name: "middle-plugin" }],
};

/** Config with a custom app icon. */
export const iconConfig: NativiteConfig = {
  ...baseConfig,
  icon: "assets/icon.png",
};

/** Same plugins as above but pre-sorted — hash should match pluginsUnsortedConfig. */
export const pluginsSortedConfig: NativiteConfig = {
  ...baseConfig,
  plugins: [{ name: "alpha-plugin" }, { name: "middle-plugin" }, { name: "zebra-plugin" }],
};

/** Config with only macOS platform. */
export const macosConfig: NativiteConfig = {
  app: {
    name: "TestApp",
    bundleId: "com.example.testapp",
    version: "1.0.0",
    buildNumber: 1,
    platforms: {
      macos: { minimumVersion: "14.0" },
    },
  },
};

/** Config with both iOS and macOS platforms. */
export const dualPlatformConfig: NativiteConfig = {
  app: {
    name: "TestApp",
    bundleId: "com.example.testapp",
    version: "1.0.0",
    buildNumber: 1,
    platforms: {
      ios: { minimumVersion: "17.0" },
      macos: { minimumVersion: "14.0" },
    },
  },
};
