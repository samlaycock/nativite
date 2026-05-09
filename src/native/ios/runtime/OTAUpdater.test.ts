import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "OTAUpdater.swift")).text();

describe("OTAUpdater.swift", () => {
  it("reads server URL and channel from NativiteConfig", () => {
    expect(swift).toContain("NativiteConfig.otaServerURL");
    expect(swift).toContain("NativiteConfig.otaChannel");
    expect(swift).toContain("NativiteConfig.otaSigningPublicKey");
    expect(swift).toContain("NativiteConfig.otaAllowInsecureHTTP");
    expect(swift).toContain("NativiteConfig.appVersion");
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
    expect(swift).toContain("try? fileManager.removeItem(at: tempURL)");
  });

  it("verifies signed manifests when a public key is configured", () => {
    expect(swift).toContain("let minimumAppVersion: String?");
    expect(swift).toContain("let signature: String?");
    expect(swift).toContain(
      "private func verifyManifest(data: Data, manifest: OTAManifest) throws",
    );
    expect(swift).toContain('json.removeValue(forKey: "signature")');
    expect(swift).toContain("Curve25519.Signing.PublicKey");
    expect(swift).toContain("publicKey.isValidSignature(signatureData, for: signedData)");
  });

  it("enforces HTTPS unless explicitly allowed and gates manifests by app version", () => {
    expect(swift).toContain("private func isTransportAllowed(_ url: URL) -> Bool");
    expect(swift).toContain("return allowInsecureHTTP");
    expect(swift).toContain("private func isAppVersionAllowed(_ minimumVersion: String?) -> Bool");
    expect(swift).toContain("NativiteConfig.appVersion.compare(minimumVersion, options: .numeric)");
  });

  it("keeps a rollback bundle until the first launch of an OTA bundle succeeds", () => {
    expect(swift).toContain("private var rollbackBundleURL: URL");
    expect(swift).toContain("func rollbackPendingLaunchIfNeeded()");
    expect(swift).toContain("func markLaunchSucceeded()");
    expect(swift).toContain('appendingPathComponent(".pending_launch")');
  });
});
