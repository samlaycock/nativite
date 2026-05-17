import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const swift = await Bun.file(join(import.meta.dirname, "NativiteTestHarness.swift")).text();

describe("NativiteTestHarness.swift", () => {
  it("serializes coordinator events in registration order", () => {
    expect(swift).toContain(
      'private static let postQueue = DispatchQueue(label: "dev.nativite.test-harness")',
    );
    expect(swift).toContain("postQueue.async {");
    expect(swift.indexOf('type: "harness.register"')).toBeLessThan(
      swift.indexOf('type: "runtime.ready"'),
    );
    expect(swift).toContain("private static func postSynchronously");
    expect(swift).toContain("DispatchSemaphore(value: 0)");
    expect(swift).not.toContain("private static func post(type:");
  });

  it("logs coordinator failures instead of silently dropping them", () => {
    expect(swift).toContain("requestError.localizedDescription");
    expect(swift).toContain("Coordinator rejected \\(type) with HTTP \\(statusCode)");
    expect(swift).toContain("coordinator request timed out");
  });

  it("does not fall back to the app version for appId", () => {
    expect(swift).toContain('"appId": Bundle.main.bundleIdentifier ?? ""');
    expect(swift).not.toContain(
      '"appId": Bundle.main.bundleIdentifier ?? NativiteConfig.appVersion',
    );
  });
});
