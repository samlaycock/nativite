import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { baseConfig } from "../../../test/fixtures.ts";
import { generateProject } from "./generator.ts";

describe("generateProject", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "nativite-ios-generator-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("hashes and writes SVG splash sources using the rasterized Splash.png output filename", async () => {
    const cwd = makeTempDir();
    const config: NativiteConfig = {
      ...baseConfig,
      splash: {
        backgroundColor: "#112233",
        image: "splash.svg",
      },
    };
    writeFileSync(join(cwd, "splash.svg"), '<svg width="200" height="100"></svg>');

    await generateProject(config, cwd);

    const contents = JSON.parse(
      readFileSync(
        join(
          cwd,
          ".nativite",
          "ios",
          "TestApp",
          "Assets.xcassets",
          "Splash.imageset",
          "Contents.json",
        ),
        "utf-8",
      ),
    ) as { readonly images: readonly { readonly filename?: string }[] };
    expect(contents.images[0]?.filename).toBe("Splash.png");
  });
});
