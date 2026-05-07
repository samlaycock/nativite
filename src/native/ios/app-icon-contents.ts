/**
 * Generates the Contents.json for AppIcon.appiconset.
 *
 * Modern Xcode 14+ uses a single 1024×1024 universal image entry —
 * Xcode automatically generates all required icon sizes at build time.
 *
 * @param filename - Optional image filename (e.g. "AppIcon.png"). When
 *   omitted, no image reference is written and Xcode shows the default
 *   blank app icon.
 */
export function appIconContentsTemplate(filename?: string): string {
  const imageEntry: Record<string, string> = {
    idiom: "universal",
    platform: "ios",
    size: "1024x1024",
  };

  if (filename) {
    imageEntry["filename"] = filename;
  }

  return JSON.stringify(
    {
      images: [imageEntry],
      info: {
        author: "xcode",
        version: 1,
      },
    },
    null,
    2,
  );
}
