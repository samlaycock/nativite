import CryptoKit
import Foundation

struct OTAAsset: Decodable {
  let path: String
  let hash: String
  let size: Int
}

struct OTAManifest: Decodable {
  let platform: String
  let version: String
  let hash: String
  let assets: [OTAAsset]
  let builtAt: String
  let minimumAppVersion: String?
  let signature: String?
}

class OTAUpdater {

  private let serverURL: URL = {
    guard let url = URL(string: NativiteConfig.otaServerURL), !NativiteConfig.otaServerURL.isEmpty else {
      return URL(string: "about:blank")!
    }
    return url
  }()
  private let updateChannel: String = NativiteConfig.otaChannel
  private let signingPublicKey: String = NativiteConfig.otaSigningPublicKey
  private let allowInsecureHTTP: Bool = NativiteConfig.otaAllowInsecureHTTP
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
    return docs.appendingPathComponent("nativite_staged_bundle_\(expectedPlatform)")
  }

  private var activeBundleURL: URL {
    let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return docs.appendingPathComponent("nativite_active_bundle_\(expectedPlatform)")
  }

  private var rollbackBundleURL: URL {
    let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return docs.appendingPathComponent("nativite_rollback_bundle_\(expectedPlatform)")
  }

  // Moves any staged bundle into the active position. Call before loadContent().
  func applyPendingUpdateIfAvailable() {
    guard fileManager.fileExists(atPath: stagedBundleURL.path) else { return }
    do {
      if fileManager.fileExists(atPath: rollbackBundleURL.path) {
        try fileManager.removeItem(at: rollbackBundleURL)
      }
      if fileManager.fileExists(atPath: activeBundleURL.path) {
        try fileManager.moveItem(at: activeBundleURL, to: rollbackBundleURL)
      }
      try "pending".write(
        to: stagedBundleURL.appendingPathComponent(".pending_launch"),
        atomically: true,
        encoding: .utf8
      )
      try fileManager.moveItem(at: stagedBundleURL, to: activeBundleURL)
    } catch {
      print("[OTAUpdater] Failed to apply staged bundle: \(error)")
    }
  }

  func markLaunchSucceeded() {
    let markerURL = activeBundleURL.appendingPathComponent(".pending_launch")
    guard fileManager.fileExists(atPath: markerURL.path) else { return }
    do {
      try fileManager.removeItem(at: markerURL)
      if fileManager.fileExists(atPath: rollbackBundleURL.path) {
        try fileManager.removeItem(at: rollbackBundleURL)
      }
    } catch {
      print("[OTAUpdater] Failed to mark OTA launch successful: \(error)")
    }
  }

  // Returns the index.html of the active OTA bundle, or nil if none exists.
  func activeBundleIndexURL() -> URL? {
    let indexURL = activeBundleURL.appendingPathComponent("index.html")
    return fileManager.fileExists(atPath: indexURL.path) ? indexURL : nil
  }

  func rollbackPendingLaunchIfNeeded() {
    let markerURL = activeBundleURL.appendingPathComponent(".pending_launch")
    guard fileManager.fileExists(atPath: markerURL.path) else { return }
    guard fileManager.fileExists(atPath: rollbackBundleURL.path) else { return }

    do {
      try fileManager.removeItem(at: activeBundleURL)
      try fileManager.moveItem(at: rollbackBundleURL, to: activeBundleURL)
      print("[OTAUpdater] Rolled back OTA bundle after an unsuccessful launch.")
    } catch {
      print("[OTAUpdater] Failed to roll back OTA bundle: \(error)")
    }
  }

  // Returns OTA status for bridge calls.
  func checkStatus() async -> [String: Any] {
    guard NativiteConfig.otaEnabled else { return ["available": false] }
    if fileManager.fileExists(atPath: stagedBundleURL.path) {
      let stagedVersion = readVersion(at: stagedBundleURL)
      if stagedVersion.isEmpty {
        return ["available": true]
      }
      return ["available": true, "version": stagedVersion]
    }

    do {
      let (manifest, _) = try await fetchManifest()
      guard isManifestAllowed(manifest) else {
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
    guard NativiteConfig.otaEnabled else { return }
    do {
      let (manifest, bundleBaseURL) = try await fetchManifest()
      guard isManifestAllowed(manifest) else {
        return
      }

      let currentHash = readHash(at: activeBundleURL)
      let stagedHash = readHash(at: stagedBundleURL)

      guard manifest.hash != currentHash && manifest.hash != stagedHash else {
        print("[OTAUpdater] Bundle is up to date (\(manifest.version))")
        return
      }

      print("[OTAUpdater] Update available: \(manifest.version). Downloading...")
      try await downloadBundle(manifest: manifest, bundleBaseURL: bundleBaseURL)
    } catch {
      print("[OTAUpdater] Update check failed: \(error)")
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
      guard isTransportAllowed(baseURL) else {
        lastError = OTAUpdaterError.insecureTransport
        continue
      }

      let manifestURL = baseURL.appendingPathComponent("manifest.json")
      do {
        let (data, response) = try await URLSession.shared.data(from: manifestURL)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
          print("[OTAUpdater] Server returned HTTP \(http.statusCode) for manifest")
          continue
        }

        let manifest = try JSONDecoder().decode(OTAManifest.self, from: data)
        try verifyManifest(data: data, manifest: manifest)
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
      let assetURL = bundleBaseURL.appendingPathComponent(asset.path)
      guard isTransportAllowed(assetURL) else {
        throw OTAUpdaterError.insecureTransport
      }
      let destination = stagedBundleURL.appendingPathComponent(asset.path)

      try fileManager.createDirectory(
        at: destination.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )

      let (tempURL, _) = try await URLSession.shared.download(from: assetURL)
      let data = try Data(contentsOf: tempURL)
      guard data.count == asset.size else {
        try? fileManager.removeItem(at: tempURL)
        throw OTAUpdaterError.assetSizeMismatch(path: asset.path)
      }
      guard sha256Hex(data) == asset.hash else {
        try? fileManager.removeItem(at: tempURL)
        throw OTAUpdaterError.assetHashMismatch(path: asset.path)
      }
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

  private func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private func isTransportAllowed(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "https" else {
      return allowInsecureHTTP
    }
    return true
  }

  private func isManifestAllowed(_ manifest: OTAManifest) -> Bool {
    guard manifest.platform == expectedPlatform else {
      print(
        "[OTAUpdater] Ignoring manifest for unexpected platform " +
          "(expected \(expectedPlatform), got \(manifest.platform))."
      )
      return false
    }
    guard isAppVersionAllowed(manifest.minimumAppVersion) else {
      print("[OTAUpdater] Ignoring manifest that requires app \(manifest.minimumAppVersion ?? "").")
      return false
    }
    return true
  }

  private func isAppVersionAllowed(_ minimumVersion: String?) -> Bool {
    guard let minimumVersion, !minimumVersion.isEmpty else { return true }
    return NativiteConfig.appVersion.compare(minimumVersion, options: .numeric) != .orderedAscending
  }

  private func verifyManifest(data: Data, manifest: OTAManifest) throws {
    guard !signingPublicKey.isEmpty else { return }
    guard let signature = manifest.signature, !signature.isEmpty else {
      throw OTAUpdaterError.missingManifestSignature
    }
    guard let publicKeyData = Data(base64Encoded: signingPublicKey),
          let signatureData = Data(base64Encoded: signature)
    else {
      throw OTAUpdaterError.invalidManifestSignature
    }

    var json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    json.removeValue(forKey: "signature")
    let signedData = try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys])
    let publicKey = try Curve25519.Signing.PublicKey(rawRepresentation: publicKeyData)

    guard publicKey.isValidSignature(signatureData, for: signedData) else {
      throw OTAUpdaterError.invalidManifestSignature
    }
  }
}

enum OTAUpdaterError: Error {
  case assetSizeMismatch(path: String)
  case assetHashMismatch(path: String)
  case insecureTransport
  case missingManifestSignature
  case invalidManifestSignature
}
