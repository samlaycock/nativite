import { describe, expect, it } from "bun:test";

import { nativiteVarsTemplate } from "../nativite-vars.ts";

describe("nativiteVarsTemplate", () => {
  it("keeps the Vite error overlay controls within native safe-area insets", () => {
    const swift = nativiteVarsTemplate();

    expect(swift).toContain("vite-error-overlay");
    expect(swift).toContain("--nk-inset-top");
    expect(swift).toContain("--nk-inset-bottom");
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
});
