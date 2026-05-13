import { defineBackgroundTask } from "nativite/background";

interface RefreshPayload {
  readonly reason?: string;
}

export default defineBackgroundTask<RefreshPayload>({
  id: "refresh-session",
  android: {
    kind: "one-off-work",
    requiresNetwork: true,
    backoffPolicy: "exponential",
    backoffDelayMinutes: 10,
  },
  async run(ctx) {
    const response = await ctx.fetch("/api/session/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: ctx.payload?.reason ?? "background" }),
    });

    if (response.status === 401) {
      await ctx.storage.remove("session-refreshed-at");
      return { status: "failure", output: { reason: "unauthorized" } };
    }

    if (!response.ok) {
      return "retry";
    }

    await ctx.storage.set("session-refreshed-at", new Date().toISOString());
    return "success";
  },
});
