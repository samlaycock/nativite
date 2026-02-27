import { describe, expect, it } from "bun:test";

import { baseConfig } from "../../../__tests__/fixtures.ts";
import { nativiteKeyboardTemplate } from "../nativite-keyboard.ts";

describe("nativiteKeyboardTemplate", () => {
  it("uses a stable intrinsic accessory height to prevent cumulative vertical drift", () => {
    const output = nativiteKeyboardTemplate(baseConfig);

    // The accessory view intrinsic height must not be derived from the mutable
    // toolbar frame height, otherwise each relayout/reload cycle can feed a
    // larger value back into intrinsic sizing and drift upward over time.
    expect(output).not.toContain(
      "CGSize(width: UIView.noIntrinsicMetric, height: toolbar.frame.height)",
    );
    expect(output).toContain("private let accessoryHeight: CGFloat = 44");
    expect(output).toContain("CGSize(width: UIView.noIntrinsicMetric, height: accessoryHeight)");
  });

  it("supports toggling root scroll lock per webview host", () => {
    const output = nativiteKeyboardTemplate(baseConfig);

    expect(output).toContain("var lockRootScroll: Bool = true");
    expect(output).toContain("guard lockRootScroll else { return }");
  });
});
