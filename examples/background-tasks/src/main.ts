/// <reference types="nativite/globals" />

import { background } from "nativite/background";

async function registerBackgroundWork(): Promise<void> {
  await background.schedule("periodic-sync");

  if (__PLATFORM__ === "android") {
    await background.schedule("refresh-session", {
      payload: { reason: "manual" },
    });

    const status = await background.getStatus("refresh-session");
    console.info("refresh-session status", status);
  }
}

registerBackgroundWork().catch((err: unknown) => {
  console.error("Background task scheduling failed", err);
});
