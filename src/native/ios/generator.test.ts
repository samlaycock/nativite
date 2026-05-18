import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NativiteConfig } from "../../index.ts";

import { baseConfig } from "../../../test/fixtures.ts";
import { macos } from "../../index.ts";
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

  it("rejects unsupported iOS background task kinds", async () => {
    const cwd = makeTempDir();
    const config: NativiteConfig = {
      ...baseConfig,
      backgroundTasks: ["./refresh.task.ts"],
    };
    writeFileSync(
      join(cwd, "refresh.task.ts"),
      `import { defineBackgroundTask } from "${join(process.cwd(), "src/background.ts")}";

export default defineBackgroundTask({
  id: "refresh",
  ios: { kind: "processing" },
  run() {},
});
`,
    );

    await generateProject(config, cwd).then(
      () => {
        throw new Error("Expected iOS background task validation to fail.");
      },
      (err) => {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain(
          'Nativite currently supports ios.kind: "app-refresh" only.',
        );
      },
    );
  });

  it("writes macOS Chromium web engine selection into generated Swift config", async () => {
    const cwd = makeTempDir();
    const config: NativiteConfig = {
      ...baseConfig,
      platforms: [macos({ webEngine: "chromium" })],
    };

    await generateProject(config, cwd, false, "generate", "macos");

    const swift = readFileSync(
      join(cwd, ".nativite", "macos", "TestApp", "NativiteConfig.swift"),
      "utf-8",
    );
    expect(swift).toContain('static let webEngine: String = "chromium"');
  });

  it("keeps macOS system web engine as the generated default", async () => {
    const cwd = makeTempDir();
    const config: NativiteConfig = {
      ...baseConfig,
      platforms: [macos()],
    };

    await generateProject(config, cwd, false, "generate", "macos");

    const swift = readFileSync(
      join(cwd, ".nativite", "macos", "TestApp", "NativiteConfig.swift"),
      "utf-8",
    );
    expect(swift).toContain('static let webEngine: String = "system"');
  });

  it("generates macOS smoke-test runtime files for launch and readiness coverage", async () => {
    const cwd = makeTempDir();
    const config: NativiteConfig = {
      ...baseConfig,
      platforms: [macos()],
    };

    await generateProject(config, cwd, false, "generate", "macos");

    const appDir = join(cwd, ".nativite", "macos", "TestApp");
    const pbxproj = readFileSync(
      join(cwd, ".nativite", "macos", "TestApp.xcodeproj", "project.pbxproj"),
      "utf-8",
    );
    const viewController = readFileSync(join(appDir, "ViewController.swift"), "utf-8");
    const bridge = readFileSync(join(appDir, "NativiteBridge.swift"), "utf-8");
    const chrome = readFileSync(join(appDir, "NativiteChrome.swift"), "utf-8");
    const harness = readFileSync(join(appDir, "NativiteTestHarness.swift"), "utf-8");

    expect(pbxproj).toContain("SDKROOT = macosx;");
    expect(pbxproj).toContain("SUPPORTED_PLATFORMS = macosx;");
    expect(pbxproj).toContain("ViewController.swift in Sources");
    expect(pbxproj).toContain("NativiteBridge.swift in Sources");
    expect(pbxproj).toContain("NativiteChrome.swift in Sources");
    expect(pbxproj).toContain("NativiteTestHarness.swift in Sources");
    expect(pbxproj).toContain("OTAUpdater.swift in Sources");
    expect(viewController).toContain("NativiteTestHarness.register(platform:");
    expect(viewController).toContain('"macos"');
    expect(viewController).toContain("NativiteTestHarness.webViewReady(url: webView.url)");
    expect(bridge).toContain("register(namespace:");
    expect(chrome).toContain("func replayPendingState()");
    expect(harness).toContain('type: "harness.register"');
    expect(harness).toContain('type: "runtime.ready"');
    expect(harness).toContain('type: "webview.ready"');
  });

  it("writes native test harness configuration inputs", async () => {
    const cwd = makeTempDir();

    await generateProject(baseConfig, cwd);

    const swift = readFileSync(
      join(cwd, ".nativite", "ios", "TestApp", "NativiteConfig.swift"),
      "utf-8",
    );
    expect(swift).toContain(
      'static let testHarnessEnabled: Bool = ProcessInfo.processInfo.environment["NATIVITE_TEST_HARNESS"] == "1"',
    );
    expect(swift).toContain(
      'static let testURL: String = ProcessInfo.processInfo.environment["NATIVITE_TEST_URL"] ?? ""',
    );
    expect(swift).toContain(
      'static let testCoordinatorURL: String = ProcessInfo.processInfo.environment["NATIVITE_COORDINATOR_URL"] ?? ""',
    );
    expect(swift).toContain(
      'static let testSessionToken: String = ProcessInfo.processInfo.environment["NATIVITE_TEST_SESSION_TOKEN"] ?? ""',
    );
  });
});
