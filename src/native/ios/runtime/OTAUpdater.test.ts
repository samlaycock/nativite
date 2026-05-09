import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "OTAUpdater.swift")).text();

describe("OTAUpdater.swift", () => {
  it("reads server URL and channel from NativiteConfig", () => {
    expect(swift).toContain("NativiteConfig.otaServerURL");
    expect(swift).toContain("NativiteConfig.otaChannel");
  });

  it("short-circuits checkStatus when OTA is not enabled", () => {
    expect(swift).toContain('guard NativiteConfig.otaEnabled else { return ["available": false] }');
  });

  it("short-circuits checkForUpdate when OTA is not enabled", () => {
    expect(swift).toContain("guard NativiteConfig.otaEnabled else { return }");
  });

  it("uses the configured OTA channel before falling back to platform-only URLs", () => {
    expect(swift).toContain("private func candidateBundleBaseURLs() -> [URL]");
    expect(swift).toContain("if !updateChannel.isEmpty");
    expect(swift).toContain(".appendingPathComponent(updateChannel, isDirectory: true)");
    expect(swift).toContain("baseURLs.append(platformBundleBaseURL)");
  });

  it("exposes checkStatus() that returns OTA availability and version", () => {
    expect(swift).toContain("func checkStatus() async -> [String: Any]");
    expect(swift).toContain('return ["available": false]');
    expect(swift).toContain('return ["available": true, "version": manifest.version]');
  });

  it("validates downloaded asset contents against the manifest", () => {
    expect(swift).toContain("import CryptoKit");
    expect(swift).toContain("struct OTAAsset: Decodable");
    expect(swift).toContain("let assets: [OTAAsset]");
    expect(swift).toContain("guard data.count == asset.size else");
    expect(swift).toContain("guard sha256Hex(data) == asset.hash else");
  });
});
