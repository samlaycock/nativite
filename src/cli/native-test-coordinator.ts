import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";

import type { NativiteLogger } from "./logger.ts";

export interface NativeTestCoordinatorConfig {
  readonly host: string;
  readonly port: number;
  readonly platform: string;
  readonly device?: string;
  readonly testUrl: string;
  readonly artifactsDir: string;
  readonly launchTimeoutMs: number;
  readonly sessionId: string;
  readonly sessionToken: string;
}

export interface NativeTestCoordinator {
  readonly endpoint: string;
  readonly sessionToken: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface CoordinatorEnvelope {
  readonly sessionId?: string;
  readonly command?: string;
  readonly type?: string;
  readonly token?: string;
  readonly payload?: unknown;
}

interface NativeTestLogEntry {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly timestamp: string;
  readonly subsystem: "coordinator" | "native" | "webview" | "test-runner";
  readonly category?: string;
}

interface NativeTestSession {
  readonly id: string;
  state: "starting" | "registered" | "webview_ready" | "closed" | "timed_out";
  readonly createdAt: number;
  readonly events: unknown[];
  readonly logs: NativeTestLogEntry[];
  latestSnapshot?: unknown;
  geometry: Record<string, unknown>;
}

const MAX_BODY_BYTES = 1024 * 1024;

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function redactSessionToken(value: string): string {
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function createNativeTestCoordinator(
  config: NativeTestCoordinatorConfig,
  logger: NativiteLogger,
): NativeTestCoordinator {
  const endpoint = `http://${config.host}:${config.port}/harness`;
  const sessions = new Map<string, NativeTestSession>();
  const sessionAliases = new Map<string, string>();
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(config, sessions, sessionAliases, request, response);
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : "Native test coordinator failed.",
      });
    }
  });

  return {
    endpoint,
    sessionToken: config.sessionToken,
    async start(): Promise<void> {
      mkdirSync(config.artifactsDir, { recursive: true });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      logger.info(
        `Native test coordinator listening at ${endpoint} with token ${redactSessionToken(config.sessionToken)}.`,
      );
      logger.info(createLaunchGuidance(config));
    },
    async stop(): Promise<void> {
      for (const session of sessions.values()) {
        if (session.state !== "closed") session.state = "closed";
      }
      await closeServer(server);
    },
  };
}

async function handleRequest(
  config: NativeTestCoordinatorConfig,
  sessions: Map<string, NativeTestSession>,
  sessionAliases: Map<string, string>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    writeJson(response, 405, { error: "Native test coordinator only accepts POST requests." });
    return;
  }

  const body = (await readJsonBody(request)) as CoordinatorEnvelope;
  const url = new URL(request.url ?? "/", `http://${config.host}:${config.port}`);

  if (url.pathname.startsWith("/commands/")) {
    const command = url.pathname.slice("/commands/".length);
    await handleCommand(config, sessions, sessionAliases, response, {
      sessionId: body.sessionId,
      command,
      payload: body.payload,
      token: body.token,
    });
    return;
  }

  if (url.pathname !== "/harness") {
    writeJson(response, 404, { error: "Unknown native test coordinator endpoint." });
    return;
  }

  if (body.command) {
    await handleCommand(config, sessions, sessionAliases, response, body);
    return;
  }

  await handleHarnessEvent(config, sessions, sessionAliases, response, body);
}

async function handleCommand(
  config: NativeTestCoordinatorConfig,
  sessions: Map<string, NativeTestSession>,
  sessionAliases: Map<string, string>,
  response: ServerResponse,
  body: CoordinatorEnvelope,
): Promise<void> {
  const command = body.command ?? body.type;
  if (!command) {
    writeJson(response, 400, { error: "Missing native test coordinator command." });
    return;
  }

  if (body.token !== config.sessionToken) {
    writeJson(response, 401, { error: "INVALID_TOKEN" });
    return;
  }

  switch (command) {
    case "open-page": {
      const nativeSessionId = readPayloadString(body.payload, "sessionId") ?? config.sessionId;
      if (body.sessionId && body.sessionId !== nativeSessionId) {
        sessionAliases.set(body.sessionId, nativeSessionId);
      }
      const session = resolveSession(config, sessions, sessionAliases, nativeSessionId);
      session.state = "starting";
      addLog(session, "info", "Native harness launch requested.", "coordinator", "launch");
      writeJson(response, 200, {
        result: {
          sessionId: session.id,
          sessionToken: config.sessionToken,
          launch: createLaunchInputs(config, nativeSessionId),
        },
      });
      return;
    }
    case "close": {
      const session = resolveSession(config, sessions, sessionAliases, body.sessionId);
      session.state = "closed";
      addLog(session, "info", "Native test session closed.", "coordinator", "lifecycle");
      writeJson(response, 200, { result: null });
      return;
    }
    case "emit":
    case "chrome-event": {
      const session = resolveSession(config, sessions, sessionAliases, body.sessionId);
      session.events.push(body.payload ?? null);
      writeJson(response, 200, { result: null });
      return;
    }
    case "latest-snapshot": {
      const session = resolveSession(config, sessions, sessionAliases, body.sessionId);
      writeJson(response, 200, { result: session.latestSnapshot });
      return;
    }
    case "geometry": {
      const session = resolveSession(config, sessions, sessionAliases, body.sessionId);
      const target = readPayloadString(body.payload, "target") ?? "default";
      writeJson(response, 200, { result: session.geometry[target] ?? null });
      return;
    }
    case "screenshot": {
      const session = resolveSession(config, sessions, sessionAliases, body.sessionId);
      const name = sanitizeArtifactName(readPayloadString(body.payload, "name") ?? "screenshot");
      const safeSessionId = sanitizeArtifactName(session.id);
      const artifactPath = join(config.artifactsDir, `${safeSessionId}-${name}.json`);
      writeFileSync(
        artifactPath,
        JSON.stringify({ sessionId: session.id, capturedAt: new Date().toISOString() }, null, 2),
      );
      writeJson(response, 200, {
        result: {
          path: artifactPath,
          mimeType: "application/json",
          description: "Coordinator placeholder screenshot artifact.",
        },
      });
      return;
    }
    case "native-logs": {
      const session = resolveSession(config, sessions, sessionAliases, body.sessionId);
      writeJson(response, 200, { result: session.logs });
      return;
    }
    default:
      writeJson(response, 400, {
        error: `Unsupported native test coordinator command: ${command}`,
      });
  }
}

async function handleHarnessEvent(
  config: NativeTestCoordinatorConfig,
  sessions: Map<string, NativeTestSession>,
  sessionAliases: Map<string, string>,
  response: ServerResponse,
  body: CoordinatorEnvelope,
): Promise<void> {
  if (body.token !== config.sessionToken) {
    writeJson(response, 401, { error: "INVALID_TOKEN" });
    return;
  }

  const session = resolveSession(config, sessions, sessionAliases, body.sessionId);
  if (body.type === "harness.register") {
    session.state = "registered";
    addLog(session, "info", "Native harness registered.", "native", "registration");
  } else if (body.type === "webview.ready") {
    session.state = "webview_ready";
    addLog(session, "info", "Native WebView reported ready.", "webview", "lifecycle");
  } else if (body.type === "chrome.snapshot") {
    session.latestSnapshot = body.payload;
  } else if (body.type === "geometry.update" && isRecord(body.payload)) {
    Object.assign(session.geometry, body.payload);
  } else {
    session.events.push({ type: body.type, payload: body.payload });
  }

  writeJson(response, 200, {
    result: {
      accepted: true,
      state: session.state,
      capabilities: ["runtime.ready", "chrome.snapshot.read", "geometry.read", "logs.read"],
    },
  });
}

function resolveSession(
  config: NativeTestCoordinatorConfig,
  sessions: Map<string, NativeTestSession>,
  sessionAliases: Map<string, string>,
  requestedId: string | undefined,
): NativeTestSession {
  const rawId = requestedId && requestedId.length > 0 ? requestedId : config.sessionId;
  const id = sessionAliases.get(rawId) ?? rawId;
  const existing = sessions.get(id);
  if (existing) return existing;

  const session: NativeTestSession = {
    id,
    state: "starting",
    createdAt: Date.now(),
    events: [],
    logs: [],
    geometry: {},
  };
  sessions.set(id, session);
  return session;
}

function addLog(
  session: NativeTestSession,
  level: NativeTestLogEntry["level"],
  message: string,
  subsystem: NativeTestLogEntry["subsystem"],
  category?: string,
): void {
  session.logs.push({
    level,
    message,
    timestamp: new Date().toISOString(),
    subsystem,
    category,
  });
}

function createLaunchGuidance(config: NativeTestCoordinatorConfig): string {
  const inputs = createLaunchInputs(config, config.sessionId);
  if (config.platform === "android") {
    return `If automatic Android launch is unavailable, run the debug app from Android Studio or Gradle with NATIVITE_TEST_HARNESS=1, NATIVITE_TEST_URL=${inputs.testUrl}, NATIVITE_COORDINATOR_URL=${inputs.coordinatorUrl}, NATIVITE_TEST_SESSION_ID=${inputs.sessionId}, and NATIVITE_TEST_SESSION_TOKEN=${redactSessionToken(config.sessionToken)}.`;
  }
  return `If automatic ${config.platform} launch is unavailable, run the generated debug scheme from Xcode with NATIVITE_TEST_HARNESS=1, NATIVITE_TEST_URL=${inputs.testUrl}, NATIVITE_COORDINATOR_URL=${inputs.coordinatorUrl}, NATIVITE_TEST_SESSION_ID=${inputs.sessionId}, and NATIVITE_TEST_SESSION_TOKEN=${redactSessionToken(config.sessionToken)}.`;
}

function createLaunchInputs(
  config: NativeTestCoordinatorConfig,
  sessionId: string,
): Record<string, string> {
  return {
    platform: config.platform,
    device: config.device ?? "",
    testUrl: config.testUrl,
    coordinatorUrl: `http://${config.host}:${config.port}/harness`,
    sessionId,
    sessionToken: config.sessionToken,
  };
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  if (!isRecord(payload)) return undefined;
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sanitizeArtifactName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES)
      throw new Error("Native test coordinator request body is too large.");
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body.length > 0 ? JSON.parse(body) : {};
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
