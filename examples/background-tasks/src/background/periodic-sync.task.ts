import { defineBackgroundTask } from "nativite/background";

interface SyncResponse {
  readonly cursor?: string;
}

export default defineBackgroundTask({
  id: "periodic-sync",
  ios: {
    kind: "app-refresh",
    earliestBeginAfterMinutes: 15,
  },
  android: {
    kind: "periodic-work",
    repeatIntervalMinutes: 15,
    requiresNetwork: "connected",
  },
  async run(ctx) {
    const cursor = await ctx.storage.get("cursor");
    const response = await ctx.fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor }),
    });

    if (!response.ok) {
      return { status: "retry", output: { status: response.status } };
    }

    const body = (await response.json()) as SyncResponse;
    if (body.cursor) {
      await ctx.storage.set("cursor", body.cursor);
    }

    ctx.log.info("Periodic sync completed", { cursor: body.cursor ?? null });
    return { status: "success", output: { cursor: body.cursor ?? null } };
  },
});
