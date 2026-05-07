import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "NativiteKeyboard.swift")).text();

describe("NativiteKeyboard.swift", () => {
  it("uses a stable intrinsic accessory height to prevent cumulative vertical drift", () => {
    expect(swift).not.toContain(
      "CGSize(width: UIView.noIntrinsicMetric, height: toolbar.frame.height)",
    );
    expect(swift).toContain("private let toolbarHeight: CGFloat = 44");
    expect(swift).toContain(
      "private var accessoryHeight: CGFloat { toolbarHeight + keyboardTopGap }",
    );
    expect(swift).toContain("CGSize(width: UIView.noIntrinsicMetric, height: accessoryHeight)");
  });

  it("adds a small visual gap between the accessory bar and keyboard", () => {
    expect(swift).toContain("private let toolbarHeight: CGFloat = 44");
    expect(swift).toContain("private let keyboardTopGap: CGFloat = 6");
    expect(swift).toContain(
      "private var accessoryHeight: CGFloat { toolbarHeight + keyboardTopGap }",
    );
    expect(swift).toContain(
      "toolbar.heightAnchor.constraint(equalToConstant: toolbarHeight).isActive = true",
    );
    expect(swift).toContain("toolbar.topAnchor.constraint(equalTo: topAnchor).isActive = true");
  });

  it("computes initial frame height from stored properties before super.init", () => {
    expect(swift).toContain("let height = toolbarHeight + keyboardTopGap");
    expect(swift).toContain("super.init(frame: CGRect(x: 0, y: 0, width: 0, height: height)");
    expect(swift).not.toContain(
      "super.init(frame: CGRect(x: 0, y: 0, width: 0, height: accessoryHeight)",
    );
  });

  it("supports toggling root scroll lock per webview host", () => {
    expect(swift).toContain("var lockRootScroll: Bool = true");
    expect(swift).toContain("guard lockRootScroll else { return }");
  });

  it("applies tint to keyboard accessory button items", () => {
    expect(swift).toContain('state["tint"] as? String');
    expect(swift).toContain("barItem.tintColor = UIColor(hex: tint)");
    expect(swift).toContain('state["style"] as? String == "destructive"');
  });
});
