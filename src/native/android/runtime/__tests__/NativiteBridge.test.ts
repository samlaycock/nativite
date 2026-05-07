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

  it("validates NCLP snapshots before applying chrome state", () => {
    expect(kt).toContain("private val lastChromeRevisionByDocId = mutableMapOf<String, Int>()");
    expect(kt).toContain('if (type == "chrome.snapshot")');
    expect(kt).toContain("if (!acceptChromeSnapshot(msg)) return");
    expect(kt).toContain('if (snapshot.optString("type") != "chrome.snapshot") return false');
    expect(kt).toContain("revision <= lastRevision");
    expect(kt).toContain("state.optJSONObject(bucket) == null");
    expect(kt).toContain("nodes.optJSONObject(children.optString(i)) == null");
  });

  it("preserves NCLP node identity through the legacy chrome adapter", () => {
    expect(kt).toContain('item["nclpId"] = nodeId');
    expect(kt).toContain('item["nclpId"] = childId');
    expect(kt).toContain('menu["nclpId"] = menuId');
    expect(kt).toContain('state["menuBar"] = mapOf("menus" to menus)');
  });

  it("emits NCLP chrome.event targets using full node identity when provided", () => {
    expect(kt).toContain('val nclpId = map?.get("nclpId")?.toString()');
    expect(kt).toContain('target = nclpId ?: "toolbar:$id"');
    expect(kt).toContain('target = nclpId ?: "titleBar:trailing:menu:$id"');
    expect(kt).toContain('"menuBar.itemPressed" -> if (id != null)');
  });
});
