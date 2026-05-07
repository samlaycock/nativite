import type { NativiteConfig } from "../../index.ts";

// Generates LaunchScreen.storyboard XML.
//
// The storyboard always sets the view's background color from config.splash.backgroundColor.
// When config.splash.image is provided an <imageView> is added that centres the image
// at its natural size (scale-to-fit on smaller screens).
//
// The storyboard uses a single ViewController scene with id "01J-lp-oVM" (Xcode default)
// and a View with id "Ze5-6b-2t3". Static IDs are fine because this file is always
// fully regenerated from config, so there is no merge conflict risk.

export function launchScreenTemplate(config: NativiteConfig): string {
  const splash = config.splash;
  const bgHex = splash?.backgroundColor ?? "#FFFFFF";
  const hasImage = Boolean(splash?.image);

  // Parse a hex colour into r/g/b components in the range 0–1.
  // Accepts "#RRGGBB" or "#RRGGBBAA"; alpha is ignored (background color is opaque).
  const { r, g, b } = hexToRgb(bgHex);
  const rStr = r.toFixed(4);
  const gStr = g.toFixed(4);
  const bStr = b.toFixed(4);

  const imageViewXml = hasImage
    ? `
        <imageView
          clipsSubviews="YES"
          userInteractionEnabled="NO"
          contentMode="scaleAspectFit"
          horizontalHuggingPriority="251"
          verticalHuggingPriority="251"
          image="Splash"
          translatesAutoresizingMaskIntoConstraints="NO"
          id="Spl-sh-img"
        />
        <constraints>
          <constraint firstItem="Spl-sh-img" firstAttribute="centerX" secondItem="Ze5-6b-2t3" secondAttribute="centerX" id="cX1"/>
          <constraint firstItem="Spl-sh-img" firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY" id="cY1"/>
          <constraint firstItem="Spl-sh-img" firstAttribute="width" relation="lessThanOrEqual" secondItem="Ze5-6b-2t3" secondAttribute="width" multiplier="0.8" id="cW1"/>
          <constraint firstItem="Spl-sh-img" firstAttribute="height" relation="lessThanOrEqual" secondItem="Ze5-6b-2t3" secondAttribute="height" multiplier="0.8" id="cH1"/>
        </constraints>`
    : "";

  const imageResourceXml = hasImage
    ? `
    <resources>
      <image name="Splash" width="120" height="120"/>
    </resources>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="22522" targetRuntime="AppleCocoa" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
  <device id="retina6_12" orientation="portrait" appearance="light"/>
  <dependencies>
    <deployment identifier="iOS"/>
    <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="22521"/>
    <capability name="Safe area layout guides" minToolsVersion="9.0"/>
    <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
  </dependencies>
  <scenes>
    <!--View Controller-->
    <scene sceneID="EHf-IW-A2E">
      <objects>
        <viewController id="01J-lp-oVM" sceneMemberID="viewController">
          <view key="view" clipsSubviews="YES" userInteractionEnabled="NO" id="Ze5-6b-2t3">
            <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
            <autoresizingMask key="autoresizingMask" flexibleMaxX="YES" flexibleMaxY="YES"/>
            <subviews>${imageViewXml}
            </subviews>
            <color key="backgroundColor" red="${rStr}" green="${gStr}" blue="${bStr}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
          </view>
        </viewController>
        <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
      </objects>
      <point key="canvasLocation" x="53" y="375"/>
    </scene>
  </scenes>${imageResourceXml}
</document>
`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleaned = hex.trim();
  if (cleaned.startsWith("#")) cleaned = cleaned.slice(1);
  // Pad to at least 6 chars
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const value = parseInt(cleaned.slice(0, 6), 16);
  if (isNaN(value)) return { r: 1, g: 1, b: 1 };
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}
