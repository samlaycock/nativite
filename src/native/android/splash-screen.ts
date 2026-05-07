import type { NativiteConfig } from "../../index.ts";

export function splashScreenTemplate(config: NativiteConfig): string {
  if (!config.splash) return "";

  const themeName = sanitizeName(config.app.name);
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.${themeName}.Splash" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">${config.splash.backgroundColor}</item>
        <item name="postSplashScreenTheme">@style/Theme.${themeName}</item>
    </style>
</resources>
`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "");
}
