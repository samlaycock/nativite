import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const kt = await Bun.file(join(import.meta.dirname, "NativiteTestHarness.kt")).text();

describe("NativiteTestHarness.kt", () => {
  it("reports the generated Android app version during registration", () => {
    expect(kt).toContain('put("runtimeVersion", BuildConfig.VERSION_NAME)');
    expect(kt).not.toContain('put("runtimeVersion", "1.0.0")');
  });

  it("does not let coordinator failures abort subsequent harness events", () => {
    expect(kt).toContain("try {");
    expect(kt).toContain("val responseCode = connection.responseCode");
    expect(kt).toContain("if (responseCode in 200..299)");
    expect(kt).toContain("connection.errorStream?.close()");
    expect(kt).toContain("catch (error: Exception)");
    expect(kt).toContain("finally {\n            connection.disconnect()");
    expect(kt).not.toContain("connection.inputStream.close()\n        connection.disconnect()");
  });

  it("always includes a string url in webview ready payloads", () => {
    expect(kt).toContain('put("url", url ?: "")');
    expect(kt).not.toContain('put("url", url)\n');
  });
});
