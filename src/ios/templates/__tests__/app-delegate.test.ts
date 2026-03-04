import { describe, expect, it } from "bun:test";

import { baseConfig, splashImageConfig } from "../../../__tests__/fixtures.ts";
import { appDelegateTemplate } from "../app-delegate.ts";

describe("appDelegateTemplate", () => {
  it("uses NavigationStack instead of UINavigationController on iOS for SwiftUI-driven title bar and toolbar", () => {
    const output = appDelegateTemplate(baseConfig);
    // iOS uses NavigationStack so SwiftUI modifiers (.navigationTitle, .toolbar)
    // can drive the navigation bar and toolbar directly.
    expect(output).toContain("NavigationStack {");
    // No explicit UINavigationController wrapping — NavigationStack creates one internally.
    expect(output).not.toContain("UINavigationController(rootViewController:");
  });

  it("returns ViewController directly from makeUIViewController (not UINavigationController)", () => {
    const output = appDelegateTemplate(baseConfig);
    // The representable returns a ViewController so updateUIViewController
    // can access vc.navigationItem.prompt for the subtitle hybrid.
    expect(output).toContain("func makeUIViewController(context: Context) -> ViewController");
    expect(output).toContain("return vc");
  });

  it("creates ViewController and injects chromeState before returning", () => {
    const output = appDelegateTemplate(baseConfig);
    // The Representable creates a ViewController and injects the chromeState
    // observable model. This ensures the SwiftUI state bridge is wired
    // before viewDidLoad fires.
    expect(output).toContain("vc.chromeState = chromeState");
  });

  it("sets subtitle via navigationItem.prompt in updateUIViewController as a UIKit hybrid", () => {
    const output = appDelegateTemplate(baseConfig);
    // SwiftUI iOS has no .navigationSubtitle(). We use the representable's
    // update method to set navigationItem.prompt from chromeState.
    expect(output).toContain("vc.navigationItem.prompt = chromeState.titleBarSubtitle");
  });

  it("applies SwiftUI title bar and toolbar modifiers inside NavigationStack", () => {
    const output = appDelegateTemplate(baseConfig);
    expect(output).toContain(".nativiteTitleBar(chromeState: chromeState)");
    expect(output).toContain(".nativiteToolbar(chromeState: chromeState)");
  });

  it("applies sheet and alert modifiers outside NavigationStack", () => {
    const output = appDelegateTemplate(baseConfig);
    // Sheets and alerts are applied at the root level so they overlay
    // the navigation stack.
    const navStackEnd = output.indexOf(".nativiteSheets(");
    const navStackStart = output.indexOf("NavigationStack {");
    expect(navStackEnd).toBeGreaterThan(navStackStart);
    expect(output).toContain(".nativiteSheets(chromeState: chromeState)");
    expect(output).toContain(".nativiteAlerts(chromeState: chromeState)");
  });

  it("macOS does not use NavigationStack or splash overlay", () => {
    const output = appDelegateTemplate(baseConfig);
    const macosStart = output.indexOf("NSViewControllerRepresentable");
    expect(macosStart).toBeGreaterThan(-1);
    const macosSection = output.slice(macosStart);
    expect(macosSection).not.toContain("NavigationStack");
    expect(macosSection).not.toContain("splashVisible");
    expect(macosSection).not.toContain("ZStack");
  });

  it("applies macOS SwiftUI chrome modifiers", () => {
    const output = appDelegateTemplate(baseConfig);
    const macosRootStart = output.indexOf("#else\nstruct NativiteRootView: View");
    expect(macosRootStart).toBeGreaterThan(-1);
    const macosSection = output.slice(macosRootStart);
    expect(macosSection).toContain(".nativiteMacTitleBar(chromeState: chromeState)");
    expect(macosSection).toContain(".nativiteMacToolbar(chromeState: chromeState)");
    expect(macosSection).toContain(".nativiteMacNavigation(chromeState: chromeState)");
    expect(macosSection).toContain(".nativiteMacSidebar(chromeState: chromeState)");
    expect(macosSection).toContain(".nativiteMacDrawers(chromeState: chromeState)");
    expect(macosSection).toContain(".nativiteMacPopovers(chromeState: chromeState)");
    expect(macosSection).toContain(".nativiteMacAppWindows(chromeState: chromeState)");
  });

  it("shows a SwiftUI splash overlay with ProgressView spinner when no splash config", () => {
    const output = appDelegateTemplate(baseConfig);
    expect(output).toContain("chromeState.splashVisible");
    expect(output).toContain("ProgressView()");
    expect(output).toContain(".controlSize(.large)");
    expect(output).toContain("Color(uiColor: .systemBackground)");
    expect(output).toContain(".ignoresSafeArea()");
  });

  it("renders splash image instead of spinner when splash image is configured", () => {
    const output = appDelegateTemplate(splashImageConfig);
    expect(output).toContain('Image("Splash")');
    expect(output).toContain(".scaledToFit()");
    expect(output).not.toContain("ProgressView()");
  });

  it("uses configured background color for splash overlay", () => {
    const output = appDelegateTemplate(splashImageConfig);
    // splashImageConfig has backgroundColor: "#FF0000"
    // → Color(red: 1.0000, green: 0.0000, blue: 0.0000)
    expect(output).toContain("Color(red: 1.0000, green: 0.0000, blue: 0.0000)");
  });

  it("animates splash with opacity transition", () => {
    const output = appDelegateTemplate(baseConfig);
    expect(output).toContain(".transition(.opacity)");
    expect(output).toContain(
      ".animation(.easeOut(duration: 0.2), value: chromeState.splashVisible)",
    );
  });

  it("places splash overlay in ZStack above NavigationStack", () => {
    const output = appDelegateTemplate(baseConfig);
    const zstackIndex = output.indexOf("ZStack {");
    const navStackIndex = output.indexOf("NavigationStack {");
    const splashIndex = output.indexOf("chromeState.splashVisible");

    expect(zstackIndex).toBeGreaterThan(-1);
    expect(navStackIndex).toBeGreaterThan(zstackIndex);
    expect(splashIndex).toBeGreaterThan(navStackIndex);
  });
});
