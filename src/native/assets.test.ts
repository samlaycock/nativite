import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  inspectNativeAsset,
  nativeAssetHashInput,
  writeAndroidIconAssets,
  writeAndroidSplashAssets,
  writeAppleIconAsset,
  writeAppleSplashAsset,
} from "./assets.ts";

describe("native asset pipeline", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "nativite-assets-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("validates and fingerprints PNG icon sources", () => {
    const cwd = makeTempDir();
    writeFileSync(join(cwd, "icon.png"), pngWithDimensions(1024, 1024));

    const asset = inspectNativeAsset(cwd, "icon.png", "icon");
    const hashInput = nativeAssetHashInput(cwd, "icon.png", "icon");

    expect(asset).toMatchObject({
      kind: "icon",
      format: "png",
      width: 1024,
      height: 1024,
    });
    expect(hashInput?.name).toBe("icon:icon.png");
    expect(hashInput?.content).toContain(asset.fingerprint);
  });

  it("rejects non-square and undersized PNG icon sources", () => {
    const cwd = makeTempDir();
    writeFileSync(join(cwd, "wide.png"), pngWithDimensions(1024, 512));
    writeFileSync(join(cwd, "small.png"), pngWithDimensions(512, 512));

    expect(() => inspectNativeAsset(cwd, "wide.png", "icon")).toThrow(
      "App icon sources must be square",
    );
    expect(() => inspectNativeAsset(cwd, "small.png", "icon")).toThrow(
      "PNG app icons must be at least 1024x1024 pixels",
    );
  });

  it("accepts SVG dimensions from viewBox for Android-friendly vector sources", () => {
    const cwd = makeTempDir();
    writeFileSync(
      join(cwd, "mark.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"></svg>',
    );

    const asset = inspectNativeAsset(cwd, "mark.svg", "icon");

    expect(asset.format).toBe("svg");
    expect(asset.width).toBe(1024);
    expect(asset.height).toBe(1024);
  });

  it("writes deterministic Apple asset filenames", async () => {
    const cwd = makeTempDir();
    const appIconDir = join(cwd, "AppIcon.appiconset");
    const splashDir = join(cwd, "Splash.imageset");
    mkdirSync(appIconDir, { recursive: true });
    mkdirSync(splashDir, { recursive: true });
    writeFileSync(join(cwd, "custom-name.svg"), '<svg width="1024" height="1024"></svg>');
    writeFileSync(join(cwd, "splash.svg"), '<svg width="200" height="100"></svg>');

    const iconFilename = await writeAppleIconAsset(
      inspectNativeAsset(cwd, "custom-name.svg", "icon"),
      appIconDir,
    );
    const splashFilename = await writeAppleSplashAsset(
      inspectNativeAsset(cwd, "splash.svg", "splash"),
      splashDir,
    );

    expect(iconFilename).toBe("AppIcon.png");
    expect(splashFilename).toBe("Splash.png");
    expect(existsSync(join(appIconDir, "AppIcon.png"))).toBe(true);
    expect(readFileSync(join(splashDir, "Splash.png"))[0]).toBe(0x89);
  });

  it("writes deterministic Android icon and splash density assets", async () => {
    const cwd = makeTempDir();
    const resDir = join(cwd, "res");
    writeFileSync(join(cwd, "icon.svg"), '<svg width="1024" height="1024"></svg>');
    writeFileSync(join(cwd, "splash.svg"), '<svg width="200" height="100"></svg>');

    const iconOutputs = await writeAndroidIconAssets(
      inspectNativeAsset(cwd, "icon.svg", "icon"),
      resDir,
    );
    const splashOutputs = await writeAndroidSplashAssets(
      inspectNativeAsset(cwd, "splash.svg", "splash"),
      resDir,
    );

    expect(iconOutputs.map((output) => output.density)).toEqual([
      "mdpi",
      "hdpi",
      "xhdpi",
      "xxhdpi",
      "xxxhdpi",
    ]);
    expect(splashOutputs.map((output) => output.density)).toEqual([
      "mdpi",
      "hdpi",
      "xhdpi",
      "xxhdpi",
      "xxxhdpi",
    ]);
    expect(existsSync(join(resDir, "mipmap-mdpi", "ic_launcher_foreground.png"))).toBe(true);
    expect(existsSync(join(resDir, "drawable-xxxhdpi", "nativite_splash.png"))).toBe(true);
  });
});

function pngWithDimensions(width: number, height: number): Buffer {
  const data = Buffer.alloc(24);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}
