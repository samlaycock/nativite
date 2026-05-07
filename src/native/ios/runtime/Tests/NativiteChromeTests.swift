import XCTest
@testable import NativiteRuntime

final class NativiteChromeTests: XCTestCase {

    private func waitForMainQueue() {
        let expectation = expectation(description: "main queue drained")
        DispatchQueue.main.async {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1)
    }

    // MARK: - applyInitialState

    func testApplyInitialStateNoopsWhenConfigHasNoDefaultChrome() {
        // When NativiteConfig.defaultChromeStateJSON is nil, applyInitialState must be a no-op.
        // This test validates that the guard path returns without crashing.
        let chrome = NativiteChrome()
        // Should not crash or throw.
        chrome.applyInitialState()
    }

    // MARK: - applyState routing

    func testApplyStateTitleBarSetsTitle() {
        let chrome = NativiteChrome()
        let state = NativiteChromeState()
        chrome.chromeState = state

        chrome.applyState(["titleBar": ["title": "Hello"]] as [String: Any])
        waitForMainQueue()

        XCTAssertEqual(state.titleBarTitle, "Hello")
    }

    func testApplyStateNavigationSetsItems() {
        let chrome = NativiteChrome()
        let state = NativiteChromeState()
        chrome.chromeState = state

        let navState: [String: Any] = [
            "items": [["id": "home", "label": "Home"]],
            "activeItem": "home",
        ]
        chrome.applyState(["navigation": navState] as [String: Any])
        waitForMainQueue()

        XCTAssertEqual(state.navigationItems.count, 1)
        XCTAssertEqual(state.navigationActiveItem, "home")
    }

    func testApplyStateToolbarSetsItems() {
        let chrome = NativiteChrome()
        let state = NativiteChromeState()
        chrome.chromeState = state

        chrome.applyState(["toolbar": ["items": [["id": "share", "label": "Share"]]]] as [String: Any])
        waitForMainQueue()

        XCTAssertEqual(state.toolbarItems.count, 1)
        XCTAssertEqual(state.toolbarItems.first?.id, "share")
    }

    #if os(iOS)
    func testApplyStateStatusBarStyleDark() {
        let chrome = NativiteChrome()
        let state = NativiteChromeState()
        chrome.chromeState = state

        chrome.applyState(["statusBar": ["style": "dark"]] as [String: Any])
        waitForMainQueue()

        XCTAssertEqual(state.statusBarStyle, .dark)
    }

    func testApplyStateStatusBarStyleLight() {
        let chrome = NativiteChrome()
        let state = NativiteChromeState()
        chrome.chromeState = state

        chrome.applyState(["statusBar": ["style": "light"]] as [String: Any])
        waitForMainQueue()

        XCTAssertEqual(state.statusBarStyle, .light)
    }

    func testApplyStateSplashHideSetsFalse() {
        let chrome = NativiteChrome()
        let state = NativiteChromeState()
        chrome.chromeState = state

        chrome.applyState(["splash": ["hidden": true]] as [String: Any])
        waitForMainQueue()

        XCTAssertFalse(state.splashVisible)
    }
    #endif
}
