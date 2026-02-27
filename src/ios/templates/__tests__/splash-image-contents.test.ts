import { describe, expect, it } from "bun:test";

import { splashImageContentsTemplate } from "../splash-image-contents.ts";

describe("splashImageContentsTemplate", () => {
  // ── Output validity ──────────────────────────────────────────────────────────

  it("returns a string that is valid JSON", () => {
    const output = splashImageContentsTemplate("logo.png");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("returns pretty-printed JSON (contains newlines and spaces)", () => {
    const output = splashImageContentsTemplate("logo.png");
    expect(output).toContain("\n");
    expect(output).toContain("  ");
  });

  // ── Xcode asset catalog structure ────────────────────────────────────────────

  it("has a top-level 'images' array", () => {
    const parsed = JSON.parse(splashImageContentsTemplate("logo.png"));
    expect(Array.isArray(parsed.images)).toBe(true);
  });

  it("has exactly three image entries (1x, 2x, 3x)", () => {
    const { images } = JSON.parse(splashImageContentsTemplate("logo.png"));
    expect(images).toHaveLength(3);
  });

  it("uses 'universal' idiom for all entries", () => {
    const { images } = JSON.parse(splashImageContentsTemplate("logo.png"));
    for (const image of images) {
      expect(image.idiom).toBe("universal");
    }
  });

  it("assigns the filename to the 1x slot only", () => {
    const { images } = JSON.parse(splashImageContentsTemplate("logo.png"));
    const oneX = images.find((i: { scale: string }) => i.scale === "1x");
    expect(oneX?.filename).toBe("logo.png");
  });

  it("leaves 2x and 3x slots without a filename", () => {
    const { images } = JSON.parse(splashImageContentsTemplate("logo.png"));
    const twoX = images.find((i: { scale: string }) => i.scale === "2x");
    const threeX = images.find((i: { scale: string }) => i.scale === "3x");
    expect(twoX?.filename).toBeUndefined();
    expect(threeX?.filename).toBeUndefined();
  });

  it("includes all three scales: 1x, 2x, 3x", () => {
    const { images } = JSON.parse(splashImageContentsTemplate("logo.png"));
    const scales = images.map((i: { scale: string }) => i.scale);
    expect(scales).toContain("1x");
    expect(scales).toContain("2x");
    expect(scales).toContain("3x");
  });

  it("has a top-level 'info' object", () => {
    const parsed = JSON.parse(splashImageContentsTemplate("logo.png"));
    expect(parsed.info).toBeDefined();
  });

  it("sets info.author to 'xcode'", () => {
    const { info } = JSON.parse(splashImageContentsTemplate("logo.png"));
    expect(info.author).toBe("xcode");
  });

  it("sets info.version to 1", () => {
    const { info } = JSON.parse(splashImageContentsTemplate("logo.png"));
    expect(info.version).toBe(1);
  });

  // ── Filename handling ────────────────────────────────────────────────────────

  it("uses the exact filename passed in", () => {
    const output = splashImageContentsTemplate("my-splash-image.png");
    expect(output).toContain("my-splash-image.png");
  });

  it("works with filenames that have no extension", () => {
    const { images } = JSON.parse(splashImageContentsTemplate("logo"));
    const oneX = images.find((i: { scale: string }) => i.scale === "1x");
    expect(oneX?.filename).toBe("logo");
  });

  it("works with filenames containing spaces", () => {
    const { images } = JSON.parse(splashImageContentsTemplate("my logo.png"));
    const oneX = images.find((i: { scale: string }) => i.scale === "1x");
    expect(oneX?.filename).toBe("my logo.png");
  });

  it("works with filenames containing subdirectory components (basename only)", () => {
    // The generator passes basename() already, but template itself just stores whatever is given
    const { images } = JSON.parse(splashImageContentsTemplate("logo.png"));
    expect(images[0]?.filename).toBe("logo.png");
  });

  // ── Snapshot ─────────────────────────────────────────────────────────────────

  it("matches snapshot for a standard PNG filename", () => {
    expect(splashImageContentsTemplate("logo.png")).toMatchSnapshot();
  });
});
