import { describe, expect, it } from "bun:test";

import { nativiteVarsTemplate } from "../nativite-vars.ts";

describe("nativiteVarsTemplate", () => {
  it("keeps the Vite error overlay controls within native safe-area insets", () => {
    const swift = nativiteVarsTemplate();

    expect(swift).toContain("vite-error-overlay");
    expect(swift).toContain("--nv-inset-top");
    expect(swift).toContain("--nv-inset-bottom");
    expect(swift).toContain("#if DEBUG");
    expect(swift).toContain('let devOverlayInsets = ""');
  });

  it("collapses multi-line CSS strings before embedding in the JS string literal", () => {
    const swift = nativiteVarsTemplate();

    // Embedding the raw multi-line 'defaults' or 'devOverlayInsets' variables directly
    // in a single-quoted JS string introduces literal newlines, which is invalid JS syntax
    // and causes WKUserScript to silently fail — leaving all CSS variables unset.
    expect(swift).not.toContain("s.textContent=':root{\\(defaults)}'");
    expect(swift).not.toContain("':root{\\(defaults)}\\(devOverlayInsets)'");

    // Should use collapsed variables instead of the raw multi-line strings.
    expect(swift).toContain(".components(separatedBy: .newlines)");
  });

  it("keeps inset-top math consistent between safe-area and chrome updates", () => {
    const swift = nativiteVarsTemplate();

    expect(swift).toContain("let insetTop    = safeTop + (navVisible ? navHeight : 0)");
    expect(swift).not.toContain(
      "let insetTop    = safeTop + statusHeight + (navVisible ? navHeight : 0)",
    );
  });
});
