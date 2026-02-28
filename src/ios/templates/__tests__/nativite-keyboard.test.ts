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
    expect(output).toContain("private let toolbarHeight: CGFloat = 44");
    expect(output).toContain(
      "private var accessoryHeight: CGFloat { toolbarHeight + keyboardTopGap }",
    );
    expect(output).toContain("CGSize(width: UIView.noIntrinsicMetric, height: accessoryHeight)");
  });

  it("adds a small visual gap between the accessory bar and keyboard", () => {
    const output = nativiteKeyboardTemplate(baseConfig);

    expect(output).toContain("private let toolbarHeight: CGFloat = 44");
    expect(output).toContain("private let keyboardTopGap: CGFloat = 6");
    expect(output).toContain(
      "private var accessoryHeight: CGFloat { toolbarHeight + keyboardTopGap }",
    );
    expect(output).toContain(
      "toolbar.heightAnchor.constraint(equalToConstant: toolbarHeight).isActive = true",
    );
    expect(output).toContain("toolbar.topAnchor.constraint(equalTo: topAnchor).isActive = true");
  });

  it("computes initial frame height from stored properties before super.init to avoid the pre-super.init self error", () => {
    const output = nativiteKeyboardTemplate(baseConfig);
    // The height must be derived from stored properties (not via the computed
    // accessoryHeight getter) because Swift forbids accessing computed properties
    // via self before super.init completes.
    expect(output).toContain("let height = toolbarHeight + keyboardTopGap");
    expect(output).toContain("super.init(frame: CGRect(x: 0, y: 0, width: 0, height: height)");
    // The super.init call must not pass accessoryHeight directly.
    expect(output).not.toContain(
      "super.init(frame: CGRect(x: 0, y: 0, width: 0, height: accessoryHeight)",
    );
  });

  it("supports toggling root scroll lock per webview host", () => {
    const output = nativiteKeyboardTemplate(baseConfig);

    expect(output).toContain("var lockRootScroll: Bool = true");
    expect(output).toContain("guard lockRootScroll else { return }");
  });
});
