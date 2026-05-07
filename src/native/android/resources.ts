import type { NativiteConfig } from "../../index.ts";

export function stringsXmlTemplate(config: NativiteConfig): string {
  const escapedName = escapeXmlAttr(config.app.name);
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapedName}</string>
</resources>
`;
}

export function colorsXmlTemplate(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="white">#FFFFFFFF</color>
    <color name="black">#FF000000</color>
</resources>
`;
}

export function themesXmlTemplate(config: NativiteConfig): string {
  const themeName = sanitizeName(config.app.name);
  const hasSplash = config.splash !== undefined;

  return `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <style name="Theme.${themeName}" parent="android:Theme.Material.Light.NoActionBar">
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
    </style>${
      hasSplash
        ? `

    <style name="Theme.${themeName}.Splash" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">${config.splash!.backgroundColor}</item>
        <item name="postSplashScreenTheme">@style/Theme.${themeName}</item>
    </style>`
        : ""
    }

</resources>
`;
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "");
}
