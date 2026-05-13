import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const swift = readFileSync(join(import.meta.dir, "NativiteBackgroundTasks.swift"), "utf-8");

describe("NativiteBackgroundTasks.swift", () => {
  it("retains JavaScriptCore contexts until asynchronous task completion", () => {
    expect(swift).toContain("private var activeContexts: [UUID: JSContext] = [:]");
    expect(swift).toContain("let contextID = retainContext(context)");
    expect(swift).toContain("self?.releaseContext(id: contextID)");
    expect(swift).toContain("JSValue(object: { finish(true) }, in: context)");
  });

  it("releases retained JavaScriptCore contexts when BGTask expiration fires", () => {
    expect(swift).toContain("var executionID: UUID?");
    expect(swift).toContain("bgTask.expirationHandler = { [weak self] in");
    expect(swift).toContain("self?.releaseContext(id: executionID)");
    expect(swift).toContain("completion.complete(false)");
  });
});
