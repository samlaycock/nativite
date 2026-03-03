import type { NativiteConfig } from "../../index.ts";

export function otaUpdaterTemplate(config: NativiteConfig): string {
  const otaUrl = config.updates?.url ?? "";
  const otaChannel = config.updates?.channel ?? "";

  return `import Foundation

struct OTAManifest: Decodable {
  let platform: String
  let version: String
  let hash: String
  let assets: [String]
  let builtAt: String
}

class OTAUpdater {

  private let serverURL: URL = {
    guard let url = URL(string: "${otaUrl}") else {
      fatalError("[Nativite] Invalid OTA server URL in config: '${otaUrl}'")
    }
    return url
  }()
  private let updateChannel: String = "${otaChannel}"
  private let fileManager = FileManager.default
  private let expectedPlatform: String = {
    #if os(iOS)
    return "ios"
    #elseif os(macOS)
    return "macos"
    #else
    return "unknown"
    #endif
  }()

  private var platformBundleBaseURL: URL {
    serverURL.appendingPathComponent(expectedPlatform, isDirectory: true)
  }

  private var channelBundleBaseURL: URL {
    serverURL
      .appendingPathComponent(updateChannel, isDirectory: true)
      .appendingPathComponent(expectedPlatform, isDirectory: true)
  }

  private var stagedBundleURL: URL {
    let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return docs.appendingPathComponent("nativite_staged_bundle_\\(expectedPlatform)")
  }

  private var activeBundleURL: URL {
    let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return docs.appendingPathComponent("nativite_active_bundle_\\(expectedPlatform)")
  }

  // Moves any staged bundle into the active position. Call before loadContent().
  func applyPendingUpdateIfAvailable() {
    guard fileManager.fileExists(atPath: stagedBundleURL.path) else { return }
    do {
      if fileManager.fileExists(atPath: activeBundleURL.path) {
        try fileManager.removeItem(at: activeBundleURL)
      }
      try fileManager.moveItem(at: stagedBundleURL, to: activeBundleURL)
    } catch {
      print("[OTAUpdater] Failed to apply staged bundle: \\(error)")
    }
  }

  // Returns the index.html of the active OTA bundle, or nil if none exists.
  func activeBundleIndexURL() -> URL? {
    let indexURL = activeBundleURL.appendingPathComponent("index.html")
    return fileManager.fileExists(atPath: indexURL.path) ? indexURL : nil
  }

  // Returns OTA status for bridge calls.
  func checkStatus() async -> [String: Any] {
    if fileManager.fileExists(atPath: stagedBundleURL.path) {
      let stagedVersion = readVersion(at: stagedBundleURL)
      if stagedVersion.isEmpty {
        return ["available": true]
      }
      return ["available": true, "version": stagedVersion]
    }

    do {
      let (manifest, _) = try await fetchManifest()
      guard manifest.platform == expectedPlatform else {
        return ["available": false]
      }

      let activeHash = readHash(at: activeBundleURL)
      let stagedHash = readHash(at: stagedBundleURL)
      guard manifest.hash != activeHash && manifest.hash != stagedHash else {
        return ["available": false]
      }
      return ["available": true, "version": manifest.version]
    } catch {
      return ["available": false]
    }
  }

  // Fetches the remote manifest and downloads a new bundle if one is available.
  func checkForUpdate() async {
    do {
      let (manifest, bundleBaseURL) = try await fetchManifest()
      guard manifest.platform == expectedPlatform else {
        print(
          "[OTAUpdater] Ignoring manifest for unexpected platform " +
            "(expected \\(expectedPlatform), got \\(manifest.platform))."
        )
        return
      }

      let currentHash = readHash(at: activeBundleURL)
      let stagedHash = readHash(at: stagedBundleURL)

      guard manifest.hash != currentHash && manifest.hash != stagedHash else {
        print("[OTAUpdater] Bundle is up to date (\\(manifest.version))")
        return
      }

      print("[OTAUpdater] Update available: \\(manifest.version). Downloading...")
      try await downloadBundle(manifest: manifest, bundleBaseURL: bundleBaseURL)
    } catch {
      print("[OTAUpdater] Update check failed: \\(error)")
    }
  }

  private func candidateBundleBaseURLs() -> [URL] {
    var baseURLs: [URL] = []
    if !updateChannel.isEmpty {
      baseURLs.append(channelBundleBaseURL)
    }
    baseURLs.append(platformBundleBaseURL)
    return baseURLs
  }

  private func fetchManifest() async throws -> (manifest: OTAManifest, bundleBaseURL: URL) {
    var lastError: Error?

    for baseURL in candidateBundleBaseURLs() {
      let manifestURL = baseURL.appendingPathComponent("manifest.json")
      do {
        let (data, response) = try await URLSession.shared.data(from: manifestURL)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
          print("[OTAUpdater] Server returned HTTP \\(http.statusCode) for manifest")
          continue
        }

        let manifest = try JSONDecoder().decode(OTAManifest.self, from: data)
        return (manifest, baseURL)
      } catch {
        lastError = error
      }
    }

    throw lastError ?? URLError(.cannotLoadFromNetwork)
  }

  private func readHash(at bundleURL: URL) -> String {
    let hashFile = bundleURL.appendingPathComponent(".hash")
    let hash = (try? String(contentsOf: hashFile, encoding: .utf8)) ?? ""
    return hash.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func readVersion(at bundleURL: URL) -> String {
    let versionFile = bundleURL.appendingPathComponent(".version")
    let version = (try? String(contentsOf: versionFile, encoding: .utf8)) ?? ""
    return version.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func downloadBundle(manifest: OTAManifest, bundleBaseURL: URL) async throws {
    if fileManager.fileExists(atPath: stagedBundleURL.path) {
      try fileManager.removeItem(at: stagedBundleURL)
    }
    try fileManager.createDirectory(at: stagedBundleURL, withIntermediateDirectories: true)

    for asset in manifest.assets {
      let assetURL = bundleBaseURL.appendingPathComponent(asset)
      let destination = stagedBundleURL.appendingPathComponent(asset)

      try fileManager.createDirectory(
        at: destination.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )

      let (tempURL, _) = try await URLSession.shared.download(from: assetURL)
      try fileManager.moveItem(at: tempURL, to: destination)
    }

    try manifest.hash.write(
      to: stagedBundleURL.appendingPathComponent(".hash"),
      atomically: true,
      encoding: .utf8
    )
    try manifest.version.write(
      to: stagedBundleURL.appendingPathComponent(".version"),
      atomically: true,
      encoding: .utf8
    )

    print("[OTAUpdater] Bundle staged successfully. Will apply on next launch.")
  }
}
`;
}
