import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf-8");
}

describe("testing stack fixtures", () => {
  it("keeps the stub-host browser-mode fixture wired to nativite/test helpers", () => {
    const fixture = readRepoFile("examples/testing-strategy/browser-mode.stub-host.example.ts");
    const readme = readRepoFile("examples/testing-strategy/README.md");

    expect(fixture).toContain('import { chromeHarness, nativeTest } from "nativite/test";');
    expect(fixture).toContain("nativeTest.ready");
    expect(fixture).toContain("nativeTest.emitChromeEvent");
    expect(fixture).toContain("chromeHarness.latestSnapshot");
    expect(readme).toContain("browser-mode.stub-host.example.ts");
    expect(readme).toContain("bunx vitest --browser.enabled --run");
  });

  it("keeps the native-provider fixture on the explicit Nativite Vitest provider path", () => {
    const config = readRepoFile("examples/testing-strategy/vitest.nativite.config.ts");
    const fixture = readRepoFile("examples/testing-strategy/native-provider.safe-area.example.ts");

    expect(config).toContain('import { nativite } from "nativite/vitest-browser-provider";');
    expect(config).toContain('provider: nativite({ platform: "ios" })');
    expect(config).toContain('instances: [{ browser: "ios" }]');
    expect(fixture).toContain('import { nativeHarness } from "nativite/test";');
    expect(fixture).toContain("nativeHarness.geometry");
    expect(fixture).toContain("nativeHarness.screenshot");
  });
});

describe("testing stack CI coverage", () => {
  it("runs fast JavaScript and fixture coverage in default PR CI", () => {
    const workflow = readRepoFile(".github/workflows/test.yml");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("run: bun test");
    expect(workflow).not.toContain("test:native");
    expect(workflow).not.toContain("xcodebuild");
    expect(workflow).not.toContain("emulator");
  });

  it("keeps simulator and emulator runtime tests in the optional native workflow", () => {
    const workflow = readRepoFile(".github/workflows/native-tests.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("run: bun run test:native:ios");
    expect(workflow).toContain("run: bun run test:native:android");
    expect(workflow).toContain("src/native/android/runtime/**");
    expect(workflow).toContain("src/native/ios/runtime/**");
  });
});
