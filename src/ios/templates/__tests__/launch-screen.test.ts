import { describe, expect, it } from "bun:test";

import { baseConfig, splashColorConfig, splashImageConfig } from "../../../__tests__/fixtures.ts";
import { hexToRgb, launchScreenTemplate } from "../launch-screen.ts";

// ─── hexToRgb ─────────────────────────────────────────────────────────────────

describe("hexToRgb", () => {
  it("parses #FFFFFF as white", () => {
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("parses #000000 as black", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("parses #FF0000 as pure red", () => {
    const { r, g, b } = hexToRgb("#FF0000");
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it("parses #00FF00 as pure green", () => {
    const { r, g, b } = hexToRgb("#00FF00");
    expect(r).toBeCloseTo(0, 5);
    expect(g).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it("parses #0000FF as pure blue", () => {
    const { r, g, b } = hexToRgb("#0000FF");
    expect(r).toBeCloseTo(0, 5);
    expect(g).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(1, 5);
  });

  it("parses lowercase hex correctly", () => {
    expect(hexToRgb("#ff0000")).toEqual(hexToRgb("#FF0000"));
  });

  it("parses mixed-case hex correctly", () => {
    expect(hexToRgb("#fF0000")).toEqual(hexToRgb("#FF0000"));
  });

  it("handles a hex string without a leading #", () => {
    expect(hexToRgb("FFFFFF")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("expands 3-char shorthand #FFF to #FFFFFF", () => {
    expect(hexToRgb("#FFF")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("expands 3-char shorthand #F00 to #FF0000", () => {
    const { r, g, b } = hexToRgb("#F00");
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it("expands 3-char shorthand #08F correctly", () => {
    // #08F → #0088FF
    const { r, g, b } = hexToRgb("#08F");
    expect(r).toBeCloseTo(0, 5);
    expect(g).toBeCloseTo(0x88 / 255, 4);
    expect(b).toBeCloseTo(1, 5);
  });

  it("ignores alpha in an 8-char #RRGGBBAA value", () => {
    // Alpha = 00 (transparent), but should be ignored — same RGB as #1A2B3C
    expect(hexToRgb("#1A2B3C00")).toEqual(hexToRgb("#1A2B3C"));
  });

  it("ignores alpha in an 8-char #RRGGBBAA value (opaque)", () => {
    expect(hexToRgb("#FF0000FF")).toEqual(hexToRgb("#FF0000"));
  });

  it("trims leading and trailing whitespace", () => {
    expect(hexToRgb("  #FFFFFF  ")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("falls back to white for a completely invalid string", () => {
    expect(hexToRgb("not-a-color")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("falls back to white for an empty string", () => {
    expect(hexToRgb("")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("falls back to white for a lone # character", () => {
    expect(hexToRgb("#")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("computes correct channel values for a mid-range colour", () => {
    // #1A2B3C: r=0x1A=26, g=0x2B=43, b=0x3C=60
    const { r, g, b } = hexToRgb("#1A2B3C");
    expect(r).toBeCloseTo(26 / 255, 4);
    expect(g).toBeCloseTo(43 / 255, 4);
    expect(b).toBeCloseTo(60 / 255, 4);
  });
});

// ─── launchScreenTemplate ─────────────────────────────────────────────────────

describe("launchScreenTemplate", () => {
  it("returns valid XML (starts with XML declaration)", () => {
    const output = launchScreenTemplate(baseConfig);
    expect(output.trimStart()).toStartWith('<?xml version="1.0"');
  });

  it("contains the storyboard document element", () => {
    const output = launchScreenTemplate(baseConfig);
    expect(output).toContain('launchScreen="YES"');
  });

  it("uses white as the default background when no splash config is set", () => {
    const output = launchScreenTemplate(baseConfig);
    // Default is #FFFFFF → r=1, g=1, b=1
    expect(output).toContain('red="1.0000"');
    expect(output).toContain('green="1.0000"');
    expect(output).toContain('blue="1.0000"');
  });

  it("applies the splash backgroundColor to the view", () => {
    // splashColorConfig uses #1A2B3C
    const output = launchScreenTemplate(splashColorConfig);
    const { r, g, b } = hexToRgb("#1A2B3C");
    expect(output).toContain(`red="${r.toFixed(4)}"`);
    expect(output).toContain(`green="${g.toFixed(4)}"`);
    expect(output).toContain(`blue="${b.toFixed(4)}"`);
  });

  it("includes an imageView element when splash.image is set", () => {
    const output = launchScreenTemplate(splashImageConfig);
    expect(output).toContain("<imageView");
    expect(output).toContain('image="Splash"');
  });

  it("does NOT include an imageView when splash.image is empty", () => {
    const output = launchScreenTemplate(splashColorConfig);
    expect(output).not.toContain("<imageView");
  });

  it("does NOT include an imageView when there is no splash config", () => {
    const output = launchScreenTemplate(baseConfig);
    expect(output).not.toContain("<imageView");
  });

  it("includes centering constraints when image is present", () => {
    const output = launchScreenTemplate(splashImageConfig);
    expect(output).toContain("centerX");
    expect(output).toContain("centerY");
  });

  it("includes a resources section when image is present", () => {
    const output = launchScreenTemplate(splashImageConfig);
    expect(output).toContain("<resources>");
    expect(output).toContain('name="Splash"');
  });

  it("does NOT include a resources section when no image is present", () => {
    const output = launchScreenTemplate(baseConfig);
    expect(output).not.toContain("<resources>");
  });

  it("uses scaleAspectFit content mode for the image", () => {
    const output = launchScreenTemplate(splashImageConfig);
    expect(output).toContain('contentMode="scaleAspectFit"');
  });

  it("uses pure red (#FF0000) correctly", () => {
    const output = launchScreenTemplate({
      ...baseConfig,
      splash: { backgroundColor: "#FF0000", image: "" },
    });
    expect(output).toContain('red="1.0000"');
    expect(output).toContain('green="0.0000"');
    expect(output).toContain('blue="0.0000"');
  });

  it("matches snapshot for a config with no splash", () => {
    expect(launchScreenTemplate(baseConfig)).toMatchSnapshot();
  });

  it("matches snapshot for a config with splash color only", () => {
    expect(launchScreenTemplate(splashColorConfig)).toMatchSnapshot();
  });

  it("matches snapshot for a config with splash color and image", () => {
    expect(launchScreenTemplate(splashImageConfig)).toMatchSnapshot();
  });
});
