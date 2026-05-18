import { describe, expect, it } from "bun:test";

import { nativite } from "./index.ts";

interface RecordedRequest {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

function createFetchRecorder(results: readonly unknown[] = [{ result: null }]): {
  readonly requests: RecordedRequest[];
  readonly fetch: typeof fetch;
} {
  const requests: RecordedRequest[] = [];
  const queue = [...results];
  const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
    const requestUrl = url instanceof Request ? url.url : url.toString();
    const body = typeof init?.body === "string" ? init.body : "{}";

    requests.push({
      url: requestUrl,
      body: JSON.parse(body) as Record<string, unknown>,
    });

    return new Response(JSON.stringify(queue.shift() ?? { result: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return { requests, fetch: fetchImplementation };
}

describe("nativite Vitest browser provider", () => {
  it("launches native harness pages through the coordinator", async () => {
    const recorder = createFetchRecorder();
    const provider = nativite({
      platform: "ios",
      device: "iPhone 17",
      coordinator: { endpoint: "http://127.0.0.1:18444/harness" },
      artifactsDir: ".nativite/artifacts",
      sessionToken: "secret-token",
      fetch: recorder.fetch,
    });

    expect(provider.name).toBe("nativite");
    expect(provider.supportsParallelism).toBe(false);

    await provider.openPage("session-1", "http://127.0.0.1:5173/__vitest__/?id=1");

    expect(recorder.requests).toEqual([
      {
        url: "http://127.0.0.1:18444/harness",
        body: {
          sessionId: "session-1",
          command: "open-page",
          token: "secret-token",
          payload: {
            url: "http://127.0.0.1:5173/__vitest__/?id=1",
            platform: "ios",
            device: "iPhone 17",
            testUrl: "http://127.0.0.1:5173/__vitest__/?id=1",
            sessionId: "session-1",
            sessionToken: "secret-token",
            artifactsDir: ".nativite/artifacts",
            launchTimeoutMs: 60000,
            watch: false,
          },
        },
      },
    ]);
  });

  it("routes commands context calls to the active coordinator session", async () => {
    const snapshot = {
      nativite: 2,
      type: "chrome.snapshot",
      docId: "main",
      revision: 1,
      root: "root",
      nodes: {},
      state: {},
    } as const;
    const recorder = createFetchRecorder([{ result: undefined }, { result: snapshot }]);
    const provider = nativite({
      platform: "android",
      coordinator: { endpoint: "http://127.0.0.1:17321/harness" },
      fetch: recorder.fetch,
    });

    const context = provider.getCommandsContext("session-2");
    await context.emit("native.ready", { ok: true });
    const latestSnapshot = await context.latestSnapshot();

    expect(latestSnapshot).toEqual(snapshot);

    expect(recorder.requests.map((request) => request.body)).toEqual([
      {
        sessionId: "session-2",
        command: "emit",
        payload: { event: "native.ready", data: { ok: true } },
      },
      {
        sessionId: "session-2",
        command: "latest-snapshot",
        payload: null,
      },
    ]);
  });

  it("turns coordinator failures into Vitest-visible errors", async () => {
    const recorder = createFetchRecorder([{ error: "native harness disconnected" }]);
    const provider = nativite({
      platform: "ios",
      coordinator: { endpoint: "http://127.0.0.1:17321/harness" },
      fetch: recorder.fetch,
    });

    try {
      await provider.getCommandsContext("session-3").nativeLogs();
      throw new Error("Expected nativeLogs to reject.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("native harness disconnected");
    }
  });

  it("cleans up every opened native harness session", async () => {
    const recorder = createFetchRecorder();
    const provider = nativite({
      platform: "android",
      coordinator: { endpoint: "http://127.0.0.1:17321/harness" },
      fetch: recorder.fetch,
    });

    await provider.openPage("session-a", "http://127.0.0.1:5173/a");
    await provider.openPage("session-b", "http://127.0.0.1:5173/b");
    await provider.close();

    expect(recorder.requests.map((request) => request.body["command"])).toEqual([
      "open-page",
      "open-page",
      "close",
      "close",
    ]);
    expect(recorder.requests.slice(2).map((request) => request.body["sessionId"])).toEqual([
      "session-a",
      "session-b",
    ]);
  });

  it("does not track sessions when opening a native harness page fails", async () => {
    const requests: RecordedRequest[] = [];
    const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : url.toString();
      const body = typeof init?.body === "string" ? init.body : "{}";
      requests.push({
        url: requestUrl,
        body: JSON.parse(body) as Record<string, unknown>,
      });

      return new Response(JSON.stringify({ error: "open failed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const provider = nativite({
      platform: "ios",
      coordinator: { endpoint: "http://127.0.0.1:17321/harness" },
      fetch: fetchImplementation,
    });

    try {
      await provider.openPage("failed-session", "http://127.0.0.1:5173/fail");
      throw new Error("Expected openPage to reject.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("open failed");
    }

    await provider.close();

    expect(requests.map((request) => request.body["command"])).toEqual(["open-page"]);
  });

  it("clears tracked sessions even when coordinator close commands fail", async () => {
    const requests: RecordedRequest[] = [];
    const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : url.toString();
      const body = typeof init?.body === "string" ? init.body : "{}";
      const parsedBody = JSON.parse(body) as Record<string, unknown>;
      requests.push({ url: requestUrl, body: parsedBody });

      if (parsedBody["command"] === "close") {
        return new Response(JSON.stringify({ error: "close failed" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ result: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const provider = nativite({
      platform: "android",
      coordinator: { endpoint: "http://127.0.0.1:17321/harness" },
      fetch: fetchImplementation,
    });

    await provider.openPage("session-a", "http://127.0.0.1:5173/a");
    await provider.openPage("session-b", "http://127.0.0.1:5173/b");
    await provider.close();
    await provider.close();

    expect(requests.map((request) => request.body["command"])).toEqual([
      "open-page",
      "open-page",
      "close",
      "close",
    ]);
  });

  it("rejects unsupported Vitest major versions with an actionable error", () => {
    expect(() => nativite({ platform: "ios", vitestVersion: "5.0.0" })).toThrow(
      "Nativite Vitest provider supports Vitest 4.x. Installed Vitest version 5.0.0 is not supported.",
    );
  });

  it("accepts supported Vitest versions with a v prefix", () => {
    expect(() => nativite({ platform: "ios", vitestVersion: "v4.1.0" })).not.toThrow();
  });
});
