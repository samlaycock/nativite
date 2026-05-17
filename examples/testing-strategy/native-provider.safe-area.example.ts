import { nativeHarness } from "nativite/test";
import { expect, it } from "vitest";

it("reads native geometry and records a screenshot artifact", async () => {
  await nativeHarness.emitChromeEvent({
    event: "activate",
    target: "titleBar:trailing:focus-search",
  });

  await expect(nativeHarness.latestSnapshot()).resolves.toMatchObject({
    nativite: 2,
    type: "chrome.snapshot",
  });

  const safeArea = await nativeHarness.geometry("safeArea");
  const keyboard = await nativeHarness.geometry("keyboard");
  const screenshot = await nativeHarness.screenshot("safe-area");

  expect(safeArea).toBeDefined();
  expect(keyboard).toBeDefined();
  expect(screenshot.path).toContain(".nativite");
});
