import { background } from "nativite/background";

async function registerBackgroundWork(): Promise<void> {
  await background.schedule("periodic-sync", {
    payload: { reason: "app-start" },
  });

  await background.schedule("refresh-session", {
    payload: { reason: "manual" },
  });

  const status = await background.getStatus("refresh-session");
  console.info("refresh-session status", status);
}

void registerBackgroundWork();
