import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeDir = join(repoRoot, "src", "native", "ios", "runtime");
const runtimeTestsDir = join(runtimeDir, "Tests");

function copySwiftFiles(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".swift")) continue;
    copyFileSync(join(sourceDir, entry.name), join(targetDir, entry.name));
  }
}

function patchBridgeSource(packageDir: string): void {
  const bridgePath = join(packageDir, "Sources", "NativiteRuntime", "NativiteBridge.swift");
  const source = readFileSync(bridgePath, "utf-8");
  writeFileSync(
    bridgePath,
    source.replace(
      "class NativiteBridge: NSObject, WKScriptMessageHandlerWithReply {",
      "class NativiteBridge: NSObject {",
    ),
  );
}

function patchHandlerRegistration(packageDir: string, relativePath: string): void {
  const filePath = join(packageDir, "Sources", "NativiteRuntime", relativePath);
  const source = readFileSync(filePath, "utf-8");
  writeFileSync(
    filePath,
    source.replaceAll(
      'config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "nativite")',
      "_ = bridge",
    ),
  );
}

function writePackageManifest(packageDir: string): void {
  writeFileSync(
    join(packageDir, "Package.swift"),
    `// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "NativiteRuntimeHarness",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "NativiteRuntime", targets: ["NativiteRuntime"]),
    ],
    targets: [
        .target(
            name: "NativiteRuntime",
            path: "Sources/NativiteRuntime",
        ),
        .testTarget(
            name: "NativiteRuntimeTests",
            dependencies: ["NativiteRuntime"],
            path: "Tests/NativiteRuntimeTests",
        ),
    ],
    swiftLanguageVersions: [.v5],
)
`,
  );
}

function writeGeneratedConfig(packageDir: string): void {
  writeFileSync(
    join(packageDir, "Sources", "NativiteRuntime", "NativiteConfig.swift"),
    `enum NativiteConfig {
    static let otaEnabled: Bool = false
    static let otaServerURL: String = ""
    static let otaChannel: String = ""
    static let defaultChromeStateJSON: String? = nil
}
`,
  );
}

function writePluginRegistrantStub(packageDir: string): void {
  writeFileSync(
    join(packageDir, "Sources", "NativiteRuntime", "NativitePluginRegistrant.swift"),
    `func registerNativitePlugins(on bridge: NativiteBridge) {
    _ = bridge
}
`,
  );
}

function runSwiftTests(packageDir: string): number {
  const command = process.platform === "darwin" ? "xcrun" : "swift";
  const args =
    process.platform === "darwin"
      ? ["swift", "test", "--package-path", packageDir]
      : ["test", "--package-path", packageDir];
  const result = spawnSync(command, args, {
    cwd: packageDir,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

const packageDir = mkdtempSync(join(tmpdir(), "nativite-ios-runtime-tests-"));

try {
  copySwiftFiles(runtimeDir, join(packageDir, "Sources", "NativiteRuntime"));
  copySwiftFiles(runtimeTestsDir, join(packageDir, "Tests", "NativiteRuntimeTests"));
  patchBridgeSource(packageDir);
  patchHandlerRegistration(packageDir, "ViewController.swift");
  patchHandlerRegistration(packageDir, "NativiteChromeState.swift");
  writeGeneratedConfig(packageDir);
  writePluginRegistrantStub(packageDir);
  writePackageManifest(packageDir);

  const exitCode = runSwiftTests(packageDir);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
} finally {
  rmSync(packageDir, { recursive: true, force: true });
}
