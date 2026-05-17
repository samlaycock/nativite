import { bridge } from "nativite/client";
import { nativeTest } from "nativite/test";
import { beforeEach, expect, it } from "vitest";

beforeEach(() => {
  nativeTest.reset();
});

it("mocks a native bridge call in regular Vitest", async () => {
  nativeTest.bridge.handle("secureStore", "get", (args) => {
    expect(args).toEqual({ key: "session" });
    return { value: "stub-token" };
  });

  await expect(bridge.call("secureStore", "get", { key: "session" })).resolves.toEqual({
    value: "stub-token",
  });

  expect(nativeTest.bridge.calls("secureStore", "get")).toHaveLength(1);
});
