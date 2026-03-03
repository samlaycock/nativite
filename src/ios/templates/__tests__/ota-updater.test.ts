import { describe, expect, it } from "bun:test";

import { otaConfig } from "../../../__tests__/fixtures.ts";
import { otaUpdaterTemplate } from "../ota-updater.ts";

describe("otaUpdaterTemplate", () => {
  it("uses the configured OTA channel before falling back to platform-only URLs", () => {
    const output = otaUpdaterTemplate(otaConfig);

    expect(output).toContain('private let updateChannel: String = "production"');
    expect(output).toContain("private func candidateBundleBaseURLs() -> [URL]");
    expect(output).toContain("if !updateChannel.isEmpty");
    expect(output).toContain(".appendingPathComponent(updateChannel, isDirectory: true)");
    expect(output).toContain("baseURLs.append(platformBundleBaseURL)");
  });

  it("exposes checkStatus() that returns OTA availability and version", () => {
    const output = otaUpdaterTemplate(otaConfig);

    expect(output).toContain("func checkStatus() async -> [String: Any]");
    expect(output).toContain('return ["available": false]');
    expect(output).toContain('return ["available": true, "version": manifest.version]');
  });
});
