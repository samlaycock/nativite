import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";

export type NativeAssetKind = "icon" | "splash";

export type NativeAssetFormat = "png" | "svg";

export interface NativeAsset {
  readonly kind: NativeAssetKind;
  readonly sourcePath: string;
  readonly format: NativeAssetFormat;
  readonly width: number;
  readonly height: number;
  readonly fingerprint: string;
}

export interface AndroidAssetOutput {
  readonly path: string;
  readonly density: string;
}

const androidIconDensities = [
  { density: "mdpi", size: 48 },
  { density: "hdpi", size: 72 },
  { density: "xhdpi", size: 96 },
  { density: "xxhdpi", size: 144 },
  { density: "xxxhdpi", size: 192 },
] as const;

const androidSplashDensities = [
  { density: "mdpi", size: 200 },
  { density: "hdpi", size: 300 },
  { density: "xhdpi", size: 400 },
  { density: "xxhdpi", size: 600 },
  { density: "xxxhdpi", size: 800 },
] as const;

export function inspectNativeAsset(
  cwd: string,
  configuredPath: string,
  kind: NativeAssetKind,
): NativeAsset {
  const sourcePath = resolve(cwd, configuredPath);
  const data = readFileSync(sourcePath);
  const ext = extname(sourcePath).toLowerCase();
  const fingerprint = createHash("sha256").update(data).digest("hex");

  if (ext === ".png") {
    const dimensions = readPngDimensions(data, configuredPath);
    validateAssetDimensions(kind, "png", dimensions.width, dimensions.height, configuredPath);
    return { kind, sourcePath, format: "png", ...dimensions, fingerprint };
  }

  if (ext === ".svg") {
    const dimensions = readSvgDimensions(data.toString("utf-8"), configuredPath);
    validateAssetDimensions(kind, "svg", dimensions.width, dimensions.height, configuredPath);
    return { kind, sourcePath, format: "svg", ...dimensions, fingerprint };
  }

  throw new Error(
    `Invalid ${kind} asset "${configuredPath}". Expected a PNG or SVG source file, received ${ext || "no extension"}.`,
  );
}

export function nativeAssetHashInput(
  cwd: string,
  configuredPath: string | undefined,
  kind: NativeAssetKind,
): { readonly name: string; readonly content: string } | undefined {
  if (!configuredPath) return undefined;

  const asset = inspectNativeAsset(cwd, configuredPath, kind);
  return {
    name: `${kind}:${configuredPath}`,
    content: JSON.stringify({
      format: asset.format,
      width: asset.width,
      height: asset.height,
      fingerprint: asset.fingerprint,
    }),
  };
}

export async function writeAppleIconAsset(asset: NativeAsset, appIconDir: string): Promise<string> {
  const filename = "AppIcon.png";
  await rasterizeAsset(asset, join(appIconDir, filename), 1024);
  return filename;
}

export async function writeAppleSplashAsset(
  asset: NativeAsset,
  splashImagesetDir: string,
): Promise<string> {
  const filename = "Splash.png";
  await rasterizeAsset(
    asset,
    join(splashImagesetDir, filename),
    Math.max(asset.width, asset.height),
  );
  return filename;
}

export async function writeAndroidIconAssets(
  asset: NativeAsset,
  resDir: string,
): Promise<readonly AndroidAssetOutput[]> {
  const filename = "ic_launcher_foreground.png";
  const outputs: AndroidAssetOutput[] = [];

  for (const { density, size } of androidIconDensities) {
    const destinationDir = join(resDir, `mipmap-${density}`);
    const destinationPath = join(destinationDir, filename);
    mkdirSync(destinationDir, { recursive: true });
    await rasterizeAsset(asset, destinationPath, size);
    outputs.push({ density, path: destinationPath });
  }

  return outputs;
}

export async function writeAndroidSplashAssets(
  asset: NativeAsset,
  resDir: string,
): Promise<readonly AndroidAssetOutput[]> {
  const filename = "nativite_splash.png";
  const outputs: AndroidAssetOutput[] = [];

  for (const { density, size } of androidSplashDensities) {
    const destinationDir = join(resDir, `drawable-${density}`);
    const destinationPath = join(destinationDir, filename);
    mkdirSync(destinationDir, { recursive: true });
    await rasterizeAsset(asset, destinationPath, size);
    outputs.push({ density, path: destinationPath });
  }

  return outputs;
}

export function writeAndroidDefaultIcon(resDir: string): void {
  const destinationPath = join(resDir, "mipmap-xxxhdpi", "ic_launcher_foreground.png");
  writeFileSync(destinationPath, defaultAndroidIconPng());
}

function readPngDimensions(
  data: Buffer,
  configuredPath: string,
): { readonly width: number; readonly height: number } {
  if (
    data.length < 24 ||
    data[0] !== 0x89 ||
    data[1] !== 0x50 ||
    data[2] !== 0x4e ||
    data[3] !== 0x47 ||
    data[4] !== 0x0d ||
    data[5] !== 0x0a ||
    data[6] !== 0x1a ||
    data[7] !== 0x0a
  ) {
    throw new Error(`Invalid PNG asset "${configuredPath}". The file is not a valid PNG image.`);
  }

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function readSvgDimensions(
  source: string,
  configuredPath: string,
): { readonly width: number; readonly height: number } {
  const svgTag = source.match(/<svg\b[^>]*>/i)?.[0];
  if (!svgTag) {
    throw new Error(
      `Invalid SVG asset "${configuredPath}". The file does not contain an <svg> root.`,
    );
  }

  const width = readSvgLength(svgTag, "width");
  const height = readSvgLength(svgTag, "height");
  if (width !== undefined && height !== undefined) return { width, height };

  const viewBox = svgTag.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  const parts = viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts?.length === 4 && parts.every(Number.isFinite)) {
    return { width: parts[2]!, height: parts[3]! };
  }

  throw new Error(
    `Invalid SVG asset "${configuredPath}". Provide numeric width/height attributes or a viewBox.`,
  );
}

function readSvgLength(svgTag: string, attribute: "width" | "height"): number | undefined {
  const value = svgTag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"))?.[1];
  if (!value) return undefined;

  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/i);
  if (!match) return undefined;

  return Number(match[1]);
}

function validateAssetDimensions(
  kind: NativeAssetKind,
  format: NativeAssetFormat,
  width: number,
  height: number,
  configuredPath: string,
): void {
  if (width <= 0 || height <= 0) {
    throw new Error(
      `Invalid ${kind} asset "${configuredPath}". Dimensions must be greater than zero.`,
    );
  }

  if (kind === "icon") {
    if (width !== height) {
      throw new Error(`Invalid icon asset "${configuredPath}". App icon sources must be square.`);
    }

    if (format === "png" && width < 1024) {
      throw new Error(
        `Invalid icon asset "${configuredPath}". PNG app icons must be at least 1024x1024 pixels.`,
      );
    }
  }
}

async function rasterizeAsset(
  asset: NativeAsset,
  destinationPath: string,
  size: number,
): Promise<void> {
  await sharp(asset.sourcePath)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(destinationPath);
}

function defaultAndroidIconPng(): Buffer {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAELklEQVR4nO3csQ3DMBAEQZdwocLtv0m5BWcmwAmYG6/lSuT/+bOn11KDXVqDz79/gKUGswFAQAR5A4CACOYTCAREkDMACIhgDsEgIILcAoGACOYaFAREkD4ACIhgGmEgIIJ0gkFABDMKAQIiyCwQCIhghuFAQASZBgUBEcw4NAiIIHkAEBDBBGJAQARJhIGACCYSCQIiSCYYBEQgFA+C9/Ya+FeIAx6ClQ0AAhth3gAgIIJ8AoGACOYMAAIiyCEYBEQwt0AgIIJcg4KACKYPAAIiSCMMBEQwnWAQEEFGIUBABDMLBAIiyDAcCIhgpkFBQAQZhwYBEUweAAREkEAMCIhgEmEgIIJEIkFABJMJBsHUQCgeBF1dA/8KccBDsLIBQGAjzBsABESQTyAQEMGcAUBABDkEg4AI5hYIBESQa1AQEMH0AUBABGmEgYAIphMMAiLIKAQIiGBmgUBABBmGAwERzDQoCIgg49AgIILJA4CACBKIAQERTCIMBESQSCQIiGAywSCYGgjFg6Cra+BfIQ54CFY2AAhshHkDgIAI8gkEAiKYMwAIiCCHYBAQwdwCgYAIcg0KAiKYPgAIiCCNMBAQwXSCQUAEGYUAARHMLBAIiCDDcCAggpkGBQERZBwaBEQweQAQEEECMSAgokwEBDBIxIJAiJ4ZYJB8KqBUDwInrtr4F8hDngIVjYACGyEeQOAgAjyCQQCIpgzAAiIIIdgEBDB3AKBgAhyDQoCIpg+AAiIII0wEBDBdIJBQAQZhQABEcwsEAiIIMNwICCCmQYFARFkHBoERDB5ABAQQQIxICCCSYSBgAgSiQQBEUwmGARTA6F4EHR1DfwrxAEPwcoGAIGNMG8AEBBBPoFAQARzBgABEeQQDAIimFsgEBBBrkFBQATTBwABEaQRBgIimE4wCIggoxAgIIKZBQIBEWQYDgREMNOgICCCjEODgAgmDwACIkggBgREMIkwEBBBIpEgIILJBINgaiAUD4KuroF/hXigIdjYACCwEeYNAAIiyCcQCIhgzgAgIIIcgkFABHMLBAIiyDUoCIhg+gAgIII0wkBABNMJBgERZBQCBEQws0AgIIIMw4GACGYaFAREkHFoEBDB5AFAQAQJxICACCYRBgIiSCQSBEQwmWAQTA2E4kHQ1TXwrxAHPAQrGwAENsK8AUBABPkEAgERzBkABESQQzAIiGBugUBABLkGBQERTB8ABESQRhgIiGA6wSAggoxCgIAIZhYIBESQYTgQEMFMg4KACDIODQIimDwACIgggRgQEMEkwkBABIlEgoAIJhMMgqmBUDwIuroG/hXigIdgZQOAwEaYNwAIiCCfQCAggjkDgIAIcggGARHMLRAIiCDXoCAggukDgIAI0ggDARFMJxgERJBRCBAQwcwCgYAIMgwHAiKYaVAQEEE/1eAL/6z6unbp6UQAAAAASUVORK5CYII=";
  return Buffer.from(png, "base64");
}
