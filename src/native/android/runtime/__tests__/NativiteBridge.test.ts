import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const kt = await Bun.file(join(import.meta.dirname, "../NativiteBridge.kt")).text();

describe("NativiteBridge.kt", () => {
  it("registers built-in __nativite__ handlers for ping and OTA status", () => {
    expect(kt).toContain("init {");
    expect(kt).toContain("registerBuiltinHandlers()");
    expect(kt).toContain('register(namespace = "__nativite__", method = "__ping__")');
    expect(kt).toContain('register(namespace = "__nativite__", method = "__ota_check__")');
    expect(kt).not.toContain('register(namespace: "__nativite__", method: "__ping__")');
    expect(kt).not.toContain('register(namespace: "__nativite__", method: "__ota_check__")');
    expect(kt).toContain('completion(Result.success(mapOf("available" to false)))');
  });

  it("uses WebMessagePort for bridge communication", () => {
    expect(kt).toContain("WebMessagePortCompat");
    expect(kt).toContain("WebViewCompat.createWebMessageChannel");
    expect(kt).toContain("WebViewCompat.postWebMessage");
  });

  it("handles chrome setState messages", () => {
    expect(kt).toContain('namespace == "__chrome__" && method == "__chrome_set_state__"');
    expect(kt).toContain("chromeState.value = state");
  });

  it("handles inter-webview messaging", () => {
    expect(kt).toContain("__chrome_messaging_post_to_parent__");
    expect(kt).toContain("__chrome_messaging_post_to_child__");
    expect(kt).toContain("__chrome_messaging_broadcast__");
  });

  it("reads defaultChromeStateJSON from NativiteConfig", () => {
    expect(kt).toContain("NativiteConfig.defaultChromeStateJSON");
  });

  it("getDefaultChromeState returns null when NativiteConfig.defaultChromeStateJSON is null", () => {
    expect(kt).toContain("fun getDefaultChromeState(): Map<String, Any?>?");
    expect(kt).toContain("val json: String = NativiteConfig.defaultChromeStateJSON ?: return null");
  });
});
