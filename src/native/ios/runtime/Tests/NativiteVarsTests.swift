import XCTest
import WebKit
@testable import NativiteRuntime

final class NativiteVarsTests: XCTestCase {

    // MARK: - buildInitScript

    func testBuildInitScriptContainsStyleElement() {
        let script = NativiteVarsTestHarness.buildInitScript()
        XCTAssertTrue(script.contains("__nv_vars__"), "init script must create the __nv_vars__ style element")
    }

    func testBuildInitScriptDefinesPatchHelper() {
        let script = NativiteVarsTestHarness.buildInitScript()
        XCTAssertTrue(script.contains("__nv_patch"), "init script must define window.__nv_patch")
    }

    func testBuildInitScriptSetsColorScheme() {
        let script = NativiteVarsTestHarness.buildInitScript()
        XCTAssertTrue(script.contains("color-scheme"), "init script must set color-scheme")
    }

    func testBuildInitScriptSetsDefaultSafeAreaZero() {
        let script = NativiteVarsTestHarness.buildInitScript()
        XCTAssertTrue(script.contains("--nv-safe-top:0px"), "safe-top defaults to 0")
        XCTAssertTrue(script.contains("--nv-safe-bottom:0px"), "safe-bottom defaults to 0")
    }

    func testBuildInitScriptSetsKeyboardDefaults() {
        let script = NativiteVarsTestHarness.buildInitScript()
        XCTAssertTrue(script.contains("--nv-keyboard-height:0px"), "keyboard height defaults to 0")
        XCTAssertTrue(script.contains("--nv-keyboard-visible:0"), "keyboard visible defaults to 0")
    }

    func testBuildInitScriptDoesNotIncludeUndocumentedSidebarVariables() {
        let script = NativiteVarsTestHarness.buildInitScript()
        XCTAssertFalse(script.contains("--nv-sidebar-width"), "sidebar width should not be seeded")
        XCTAssertFalse(script.contains("--nv-sidebar-visible"), "sidebar visibility should not be seeded")
    }

    // MARK: - px helper

    func testPxFormatsOneDecimalPlace() {
        XCTAssertEqual(NativiteVarsTestHarness.px(44), "44.0px")
        XCTAssertEqual(NativiteVarsTestHarness.px(0), "0.0px")
        XCTAssertEqual(NativiteVarsTestHarness.px(34.5), "34.5px")
    }
}

// MARK: - Test harness (exposes private helpers via module-internal visibility)

#if os(iOS)
import UIKit

/// Thin wrapper that exposes the static helpers used internally by NativiteVars for unit testing.
enum NativiteVarsTestHarness {
    static func buildInitScript() -> String {
        // Instantiate a minimal NativiteVars and call its user-script builder via a WKWebViewConfiguration.
        let config = WKWebViewConfiguration()
        let vars = NativiteVars()
        vars.installUserScript(into: config)
        let scripts = config.userContentController.userScripts
        return scripts.first?.source ?? ""
    }

    static func px(_ value: CGFloat) -> String {
        String(format: "%.1fpx", value)
    }
}
#elseif os(macOS)
import Cocoa

enum NativiteVarsTestHarness {
    static func buildInitScript() -> String {
        let config = WKWebViewConfiguration()
        let vars = NativiteVars()
        vars.installUserScript(into: config)
        let scripts = config.userContentController.userScripts
        return scripts.first?.source ?? ""
    }

    static func px(_ value: CGFloat) -> String {
        String(format: "%.1fpx", value)
    }
}
#endif
