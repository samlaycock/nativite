// Generates the Contents.json for Assets.xcassets/Splash.imageset.
//
// The imageset carries a single "universal" image slot (filename is taken from
// the basename of config.splash.image). Xcode/iOS picks the right resolution
// at render time; the consumer provides a single source image and the
// generator copies it in as the universal entry.

export function splashImageContentsTemplate(filename: string): string {
  return JSON.stringify(
    {
      images: [
        {
          idiom: "universal",
          filename,
          scale: "1x",
        },
        {
          idiom: "universal",
          scale: "2x",
        },
        {
          idiom: "universal",
          scale: "3x",
        },
      ],
      info: {
        author: "xcode",
        version: 1,
      },
    },
    null,
    2,
  );
}
