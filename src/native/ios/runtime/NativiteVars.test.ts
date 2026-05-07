import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "NativiteVars.swift")).text();

describe("NativiteVars.swift", () => {
  it("keeps the Vite error overlay controls within native safe-area insets", () => {
    expect(swift).toContain("vite-error-overlay");
    expect(swift).toContain("--nv-inset-top");
    expect(swift).toContain("--nv-inset-bottom");
    expect(swift).toContain("#if DEBUG");
    expect(swift).toContain('let devOverlayInsets = ""');
  });

  it("collapses multi-line CSS strings before embedding in the JS string literal", () => {
    expect(swift).not.toContain("s.textContent=':root{\\(defaults)}'");
    expect(swift).not.toContain("':root{\\(defaults)}\\(devOverlayInsets)'");
    expect(swift).toContain(".components(separatedBy: .newlines)");
  });

  it("declares color-scheme on :root so prefers-color-scheme media queries work", () => {
    expect(swift).toContain("color-scheme:light dark;");
  });

  it("sets data-nv-theme attribute on documentElement for CSS dark mode selectors", () => {
    expect(swift).toContain("data-nv-theme");
    expect(swift).toContain("setAttribute('data-nv-theme'");
  });

  it("updates data-nv-theme attribute when appearance traits change", () => {
    expect(swift).toContain('"data-nv-theme": isDark ? "dark" : "light"');
  });

  it("keeps inset-top math consistent between safe-area and chrome updates", () => {
    expect(swift).toContain("let insetTop    = safeTop + (navVisible ? navHeight : 0)");
    expect(swift).not.toContain(
      "let insetTop    = safeTop + statusHeight + (navVisible ? navHeight : 0)",
    );
  });
});
