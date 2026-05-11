import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { NativitePluginMode } from "../../index.ts";

const ANDROID_EMULATOR_LOOPBACK_HOST = "10.0.2.2";

export function normalizeAndroidDevServerUrl(devUrl: string): string {
  try {
    const url = new URL(devUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
      url.hostname = ANDROID_EMULATOR_LOOPBACK_HOST;
    }
    return url.toString();
  } catch {
    return devUrl;
  }
}

export function syncAndroidDevMetadata(cwd: string, mode: NativitePluginMode): void {
  const sourcePath = join(cwd, ".nativite", "dev.json");
  const destinationPath = join(
    cwd,
    ".nativite",
    "android",
    "app",
    "src",
    "main",
    "assets",
    "dev.json",
  );

  if (mode !== "dev") {
    rmSync(destinationPath, { force: true });
    return;
  }

  if (!existsSync(sourcePath)) return;

  const rawDevMetadata = readFileSync(sourcePath, "utf-8");
  const parsedDevMetadata = JSON.parse(rawDevMetadata) as {
    devURL?: unknown;
    diagnostics?: unknown;
    native?: {
      androidEmulatorURL?: unknown;
      androidDeviceURL?: unknown;
      androidUsbReverseCommand?: unknown;
    };
  };
  const { diagnostics: _diagnostics, ...devMetadata } = parsedDevMetadata;
  const androidEmulatorURL =
    typeof parsedDevMetadata.native?.androidEmulatorURL === "string"
      ? parsedDevMetadata.native.androidEmulatorURL
      : undefined;
  const devURL =
    androidEmulatorURL ??
    (typeof parsedDevMetadata.devURL === "string"
      ? normalizeAndroidDevServerUrl(parsedDevMetadata.devURL)
      : parsedDevMetadata.devURL);
  const normalizedDevMetadata = {
    ...devMetadata,
    devURL,
    android: {
      emulatorURL: devURL,
      deviceURL:
        typeof parsedDevMetadata.native?.androidDeviceURL === "string"
          ? parsedDevMetadata.native.androidDeviceURL
          : devURL,
      usbReverseCommand:
        typeof parsedDevMetadata.native?.androidUsbReverseCommand === "string"
          ? parsedDevMetadata.native.androidUsbReverseCommand
          : undefined,
    },
  };

  mkdirSync(dirname(destinationPath), { recursive: true });
  writeFileSync(destinationPath, JSON.stringify(normalizedDevMetadata, null, 2));
}
