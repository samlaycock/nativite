import { describe, expect, it } from "bun:test";

import { appIconContentsTemplate } from "../app-icon-contents.ts";

describe("appIconContentsTemplate", () => {
  // ── Without filename (no icon configured) ─────────────────────────────────

  describe("without filename", () => {
    it("returns valid JSON", () => {
      const result = appIconContentsTemplate();
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("contains a single image entry", () => {
      const parsed = JSON.parse(appIconContentsTemplate());
      expect(parsed.images).toHaveLength(1);
    });

    it("uses universal idiom and ios platform", () => {
      const parsed = JSON.parse(appIconContentsTemplate());
      expect(parsed.images[0].idiom).toBe("universal");
      expect(parsed.images[0].platform).toBe("ios");
    });

    it("uses 1024x1024 size", () => {
      const parsed = JSON.parse(appIconContentsTemplate());
      expect(parsed.images[0].size).toBe("1024x1024");
    });

    it("does not include a filename field", () => {
      const parsed = JSON.parse(appIconContentsTemplate());
      expect(parsed.images[0]).not.toHaveProperty("filename");
    });

    it("includes Xcode author info", () => {
      const parsed = JSON.parse(appIconContentsTemplate());
      expect(parsed.info).toEqual({ author: "xcode", version: 1 });
    });

    it("matches snapshot", () => {
      expect(appIconContentsTemplate()).toMatchSnapshot();
    });
  });

  // ── With filename (icon configured) ───────────────────────────────────────

  describe("with filename", () => {
    it("returns valid JSON", () => {
      const result = appIconContentsTemplate("AppIcon.png");
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("includes the filename in the image entry", () => {
      const parsed = JSON.parse(appIconContentsTemplate("AppIcon.png"));
      expect(parsed.images[0].filename).toBe("AppIcon.png");
    });

    it("preserves universal idiom, ios platform, and 1024x1024 size", () => {
      const parsed = JSON.parse(appIconContentsTemplate("icon.png"));
      expect(parsed.images[0].idiom).toBe("universal");
      expect(parsed.images[0].platform).toBe("ios");
      expect(parsed.images[0].size).toBe("1024x1024");
    });

    it("handles filenames with spaces", () => {
      const parsed = JSON.parse(appIconContentsTemplate("my app icon.png"));
      expect(parsed.images[0].filename).toBe("my app icon.png");
    });

    it("handles filenames without extension", () => {
      const parsed = JSON.parse(appIconContentsTemplate("AppIcon"));
      expect(parsed.images[0].filename).toBe("AppIcon");
    });

    it("handles various image extensions", () => {
      for (const ext of ["png", "jpg", "jpeg", "webp"]) {
        const parsed = JSON.parse(appIconContentsTemplate(`icon.${ext}`));
        expect(parsed.images[0].filename).toBe(`icon.${ext}`);
      }
    });

    it("matches snapshot", () => {
      expect(appIconContentsTemplate("AppIcon.png")).toMatchSnapshot();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("treats empty string as no filename", () => {
      const parsed = JSON.parse(appIconContentsTemplate(""));
      expect(parsed.images[0]).not.toHaveProperty("filename");
    });
  });
});
