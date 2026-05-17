import { chrome, titleBar } from "nativite/chrome";
import { chromeHarness, nativeTest } from "nativite/test";
import { beforeEach, expect, it } from "vitest";

beforeEach(() => {
  nativeTest.reset();
  nativeTest.ready({ platform: "ios" });
});

it("asserts the latest NCLP chrome snapshot emitted by app code", async () => {
  const cleanup = chrome(
    titleBar({
      title: "Inbox",
      trailingItems: [{ id: "save", label: "Save" }],
    }),
  );

  await Promise.resolve();

  expect(chromeHarness.latestSnapshot()).toMatchObject({
    nativite: 2,
    type: "chrome.snapshot",
  });

  cleanup();
});

it("emits an NCLP chrome.event from the stub host", async () => {
  const itemIds: string[] = [];
  const unsubscribe = chrome.on("titleBar.trailingItemPressed", (event) => {
    itemIds.push(event.id);
  });

  await nativeTest.emitChromeEvent({
    event: "activate",
    target: "titleBar:trailing:save",
  });

  expect(itemIds).toEqual(["save"]);
  unsubscribe();
});
