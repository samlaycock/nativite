export function appIconXmlTemplate(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/white" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
}

export function appIconTemplate(): string {
  // Placeholder — the real icon is copied from config.icon by the generator.
  // This returns an empty string since the actual PNG is copied directly.
  return "";
}
