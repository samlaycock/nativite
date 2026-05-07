import { describe, expect, it } from "bun:test";

import { mainEntryTemplate } from "../main-entry.ts";

describe("mainEntryTemplate", () => {
  it("owns a shared chromeState at the App level and passes it to NativiteRootView", () => {
    const output = mainEntryTemplate();
    expect(output).toContain("@State private var chromeState = NativiteChromeState()");
    expect(output).toContain("NativiteRootView(chromeState: chromeState)");
  });

  it("adds macOS menu commands powered by NativiteMenuBarCommands", () => {
    const output = mainEntryTemplate();
    expect(output).toContain(
      "@NSApplicationDelegateAdaptor(NativiteAppDelegate.self) var appDelegate",
    );
    expect(output).toContain(".commands {");
    expect(output).toContain("NativiteMenuBarCommands(chromeState: chromeState)");
    expect(output).toContain(".defaultSize(width: 1024, height: 768)");
  });

  it("defaults to unified window toolbar style on macOS", () => {
    const output = mainEntryTemplate();
    expect(output).toContain(".windowToolbarStyle(.unified)");
  });

  it("supports expanded window toolbar style on macOS", () => {
    const output = mainEntryTemplate({ toolbarStyle: "expanded" });
    expect(output).toContain(".windowToolbarStyle(.expanded)");
    expect(output).not.toContain(".windowToolbarStyle(.unified)");
  });
});
