import type { NativiteConfig } from "../../index.ts";

export function otaUpdaterTemplate(config: NativiteConfig): string {
  const otaUrl = config.updates?.url ?? "";

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

  // Fetches the remote manifest and downloads a new bundle if one is available.
  func checkForUpdate() async {
    let manifestURL = platformBundleBaseURL.appendingPathComponent("manifest.json")
    do {
      let (data, response) = try await URLSession.shared.data(from: manifestURL)
      if let http = response as? HTTPURLResponse, http.statusCode != 200 {
        print("[OTAUpdater] Server returned HTTP \\(http.statusCode) for manifest")
        return
      }
      let manifest = try JSONDecoder().decode(OTAManifest.self, from: data)
      guard manifest.platform == expectedPlatform else {
        print(
          "[OTAUpdater] Ignoring manifest for unexpected platform " +
            "(expected \\(expectedPlatform), got \\(manifest.platform))."
        )
        return
      }

      let hashFile = activeBundleURL.appendingPathComponent(".hash")
      let currentHash = (try? String(contentsOf: hashFile, encoding: .utf8)) ?? ""

      guard manifest.hash != currentHash else {
        print("[OTAUpdater] Bundle is up to date (\\(manifest.version))")
        return
      }

      print("[OTAUpdater] Update available: \\(manifest.version). Downloading...")
      try await downloadBundle(manifest: manifest)
    } catch {
      print("[OTAUpdater] Update check failed: \\(error)")
    }
  }

  private func downloadBundle(manifest: OTAManifest) async throws {
    if fileManager.fileExists(atPath: stagedBundleURL.path) {
      try fileManager.removeItem(at: stagedBundleURL)
    }
    try fileManager.createDirectory(at: stagedBundleURL, withIntermediateDirectories: true)

    for asset in manifest.assets {
      let assetURL = platformBundleBaseURL.appendingPathComponent(asset)
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

    print("[OTAUpdater] Bundle staged successfully. Will apply on next launch.")
  }
}
`;
}
