import XCTest
import WebKit
@testable import NativiteRuntime

final class NativiteBridgeTests: XCTestCase {

    // MARK: - Handler registration

    func testPingHandlerRegisteredByDefault() {
        let bridge = NativiteBridge()
        let expectation = expectation(description: "ping handler fires")

        bridge.dispatchForTesting(namespace: "__nativite__", method: "__ping__", args: nil) { result in
            switch result {
            case .success(let value):
                XCTAssertEqual(value as? String, "pong")
                expectation.fulfill()
            case .failure(let error):
                XCTFail("ping failed: \(error)")
            }
        }

        wait(for: [expectation], timeout: 1)
    }

    func testOtaCheckHandlerRegisteredByDefault() {
        let bridge = NativiteBridge()
        let expectation = expectation(description: "ota_check handler fires")

        bridge.dispatchForTesting(namespace: "__nativite__", method: "__ota_check__", args: nil) { result in
            switch result {
            case .success(let value):
                let dict = value as? [String: Any]
                XCTAssertNotNil(dict?["available"], "ota_check must return an 'available' key")
                expectation.fulfill()
            case .failure(let error):
                XCTFail("ota_check failed: \(error)")
            }
        }

        wait(for: [expectation], timeout: 2)
    }

    func testUnknownHandlerReturnsError() {
        let bridge = NativiteBridge()
        let expectation = expectation(description: "unknown handler returns error")

        bridge.dispatchForTesting(namespace: "fake", method: "noop", args: nil) { result in
            switch result {
            case .failure:
                expectation.fulfill()
            case .success:
                XCTFail("Expected failure for unknown method")
            }
        }

        wait(for: [expectation], timeout: 1)
    }

    func testCustomHandlerCanBeRegistered() {
        let bridge = NativiteBridge()
        bridge.register(namespace: "test", method: "echo") { args, completion in
            completion(.success(args))
        }

        let expectation = expectation(description: "custom echo handler fires")

        bridge.dispatchForTesting(namespace: "test", method: "echo", args: "hello") { result in
            switch result {
            case .success(let value):
                XCTAssertEqual(value as? String, "hello")
                expectation.fulfill()
            case .failure(let error):
                XCTFail("echo failed: \(error)")
            }
        }

        wait(for: [expectation], timeout: 1)
    }

    func testLaterRegistrationOverridesExistingHandler() {
        let bridge = NativiteBridge()
        bridge.register(namespace: "test", method: "echo") { _, completion in
            completion(.success("old"))
        }
        bridge.register(namespace: "test", method: "echo") { _, completion in
            completion(.success("new"))
        }

        let expectation = expectation(description: "latest handler wins")

        bridge.dispatchForTesting(namespace: "test", method: "echo", args: nil) { result in
            switch result {
            case .success(let value):
                XCTAssertEqual(value as? String, "new")
                expectation.fulfill()
            case .failure(let error):
                XCTFail("echo failed: \(error)")
            }
        }

        wait(for: [expectation], timeout: 1)
    }
}

// MARK: - Test-only dispatch hook

extension NativiteBridge {
    /// Exposes the internal dispatch path for unit testing without going through WKScriptMessage.
    func dispatchForTesting(
        namespace: String,
        method: String,
        args: Any?,
        completion: @escaping (Result<Any?, Error>) -> Void
    ) {
        let key = "\(namespace).\(method)"
        guard let handler = handlers[key] else {
            completion(.failure(BridgeError.unknownMethod(namespace: namespace, method: method)))
            return
        }
        handler(args, completion)
    }

    var handlers: [String: NativiteHandler] {
        Mirror(reflecting: self).children.first { $0.label == "handlers" }?.value as? [String: NativiteHandler] ?? [:]
    }
}
