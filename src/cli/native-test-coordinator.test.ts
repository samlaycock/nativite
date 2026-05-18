import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NativiteLogger } from "./logger.ts";

import {
  createNativeTestCoordinator,
  createSessionToken,
  redactSessionToken,
} from "./native-test-coordinator.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createArtifactsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nativite-coordinator-"));
  tempDirs.push(dir);
  return dir;
}

function createLogger(): NativiteLogger {
  return {
    tag: "nativite",
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

function createCoordinatorConfig() {
  return {
    host: "127.0.0.1",
    port: 19_421 + Math.floor(Math.random() * 10_000),
    platform: "ios",
    testUrl: "http://127.0.0.1:5173/__nativite_test__",
    artifactsDir: createArtifactsDir(),
    launchTimeoutMs: 250,
    sessionId: "session-1",
    sessionToken: "secret-session-token",
  };
}

async function post(endpoint: string, body: unknown): Promise<Response> {
  return await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("native test coordinator", () => {
  it("generates high-entropy session tokens and redacts them in logs", () => {
    const token = createSessionToken();

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(redactSessionToken("secret-session-token")).toBe("secr...oken");
  });

  it("accepts the provider lifecycle and token-authenticated harness registration", async () => {
    const config = createCoordinatorConfig();
    const coordinator = createNativeTestCoordinator(config, createLogger());

    await coordinator.start();
    try {
      const openResponse = await post(coordinator.endpoint, {
        sessionId: "vitest-session",
        command: "open-page",
        token: config.sessionToken,
        payload: { url: config.testUrl, sessionId: config.sessionId },
      });
      expect(openResponse.status).toBe(200);
      expect(await openResponse.json()).toMatchObject({
        result: {
          sessionId: config.sessionId,
          sessionToken: config.sessionToken,
          launch: { sessionId: config.sessionId },
        },
      });

      const rejectedResponse = await post(coordinator.endpoint, {
        sessionId: "vitest-session",
        type: "harness.register",
        token: "wrong-token",
        payload: {},
      });
      expect(rejectedResponse.status).toBe(401);

      const registerResponse = await post(coordinator.endpoint, {
        sessionId: config.sessionId,
        type: "harness.register",
        token: config.sessionToken,
        payload: { platform: "ios" },
      });
      expect(registerResponse.status).toBe(200);
      expect(await registerResponse.json()).toMatchObject({
        result: { accepted: true, state: "registered" },
      });

      const logsResponse = await post(`${coordinator.endpoint}/../commands/native-logs`, {
        sessionId: "vitest-session",
        token: config.sessionToken,
        payload: null,
      });
      expect(logsResponse.status).toBe(200);
      expect(await logsResponse.json()).toMatchObject({
        result: [
          { message: "Native harness launch requested." },
          { message: "Native harness registered." },
        ],
      });
    } finally {
      await coordinator.stop();
    }
  });

  it("rejects coordinator commands when the session token is missing", async () => {
    const config = createCoordinatorConfig();
    const coordinator = createNativeTestCoordinator(config, createLogger());

    await coordinator.start();
    try {
      const response = await post(`${coordinator.endpoint}/../commands/native-logs`, {
        sessionId: config.sessionId,
        payload: null,
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "INVALID_TOKEN" });
    } finally {
      await coordinator.stop();
    }
  });

  it("routes command helpers, writes screenshot artifacts, and cleans up", async () => {
    const config = createCoordinatorConfig();
    const coordinator = createNativeTestCoordinator(config, createLogger());

    await coordinator.start();
    try {
      const screenshotResponse = await post(`${coordinator.endpoint}/../commands/screenshot`, {
        sessionId: config.sessionId,
        token: config.sessionToken,
        payload: { name: "safe area" },
      });
      expect(screenshotResponse.status).toBe(200);
      const artifact = (await screenshotResponse.json()) as {
        readonly result: { readonly path: string };
      };
      expect(artifact.result.path).toEndWith("session-1-safe-area.json");

      const logsResponse = await post(`${coordinator.endpoint}/../commands/native-logs`, {
        sessionId: config.sessionId,
        token: config.sessionToken,
        payload: null,
      });
      expect(logsResponse.status).toBe(200);
      expect(await logsResponse.json()).toMatchObject({ result: [] });
    } finally {
      await coordinator.stop();
    }

    await post(coordinator.endpoint, {}).then(
      () => {
        throw new Error("Expected stopped coordinator request to fail.");
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
      },
    );
  });

  it("sanitizes caller-controlled session ids before writing artifacts", async () => {
    const config = createCoordinatorConfig();
    const coordinator = createNativeTestCoordinator(config, createLogger());

    await coordinator.start();
    try {
      const response = await post(`${coordinator.endpoint}/../commands/screenshot`, {
        sessionId: "../../escape",
        token: config.sessionToken,
        payload: { name: "../safe area" },
      });

      expect(response.status).toBe(200);
      const artifact = (await response.json()) as {
        readonly result: { readonly path: string };
      };
      expect(artifact.result.path).toStartWith(config.artifactsDir);
      expect(artifact.result.path).toEndWith("..-..-escape-..-safe-area.json");
    } finally {
      await coordinator.stop();
    }
  });
});
