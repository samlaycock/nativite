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

  const safeArea = await coordinatorCommand("geometry", { target: "safeArea" });
  const keyboard = await coordinatorCommand("geometry", { target: "keyboard" });
  const screenshot = await coordinatorCommand("screenshot", { name: "safe-area" });

  expect(safeArea).toBeDefined();
  expect(keyboard).toBeDefined();
  expect(screenshot.path).toContain(".nativite");
});

async function coordinatorCommand<T>(
  command: string,
  payload: unknown,
): Promise<T & { readonly path?: string }> {
  const endpoint = process.env["NATIVITE_COORDINATOR_URL"];
  if (!endpoint) {
    throw new Error("Run with bunx nativite test so coordinator commands are available");
  }

  const response = await fetch(new URL(`/commands/${command}`, endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`${command} command failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T & { readonly path?: string };
}
