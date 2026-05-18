export interface NativiteVitestProviderOptions {
  readonly platform: "ios" | "macos" | "android";
  readonly device?: string;
  readonly testUrl?: string;
  readonly coordinator?: {
    readonly endpoint?: string;
  };
  readonly artifactsDir?: string;
  readonly sessionId?: string;
  readonly sessionToken?: string;
  readonly launchTimeoutMs?: number;
  readonly watch?: boolean;
  readonly vitestVersion?: string;
  readonly fetch?: typeof fetch;
}

export interface NativiteBrowserProvider {
  readonly name: "nativite";
  readonly supportsParallelism: false;
  getCommandsContext(sessionId: string): NativiteCommandsContext;
  openPage(sessionId: string, url: string, options?: unknown): Promise<void>;
  close(): Promise<void>;
}

export interface NativiteCommandsContext {
  emit(event: string, data?: unknown): Promise<void>;
  emitChromeEvent(event: NativiteChromeEventInput): Promise<void>;
  latestSnapshot(): Promise<NativiteChromeSnapshot | undefined>;
  geometry(target: string): Promise<unknown>;
  screenshot(name?: string): Promise<NativiteArtifact>;
  nativeLogs(): Promise<readonly NativiteLogEntry[]>;
}

export interface NativiteChromeEventInput {
  readonly event: string;
  readonly target: string;
  readonly docId?: string;
  readonly value?: unknown;
}

export interface NativiteChromeSnapshot {
  readonly nativite: 2;
  readonly type: "chrome.snapshot";
  readonly docId: string;
  readonly revision: number;
  readonly root: string;
  readonly nodes: Record<string, unknown>;
  readonly state: Record<string, unknown>;
}

export interface NativiteArtifact {
  readonly path: string;
  readonly mimeType?: string;
  readonly description?: string;
}

export interface NativiteLogEntry {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly timestamp?: string;
  readonly subsystem?: string;
  readonly category?: string;
}

interface CoordinatorCommandBody {
  readonly sessionId: string;
  readonly command: string;
  readonly payload: unknown;
}

const SUPPORTED_VITEST_MAJOR = 4;
const DEFAULT_COORDINATOR_ENDPOINT = "http://127.0.0.1:17321/harness";
const DEFAULT_LAUNCH_TIMEOUT_MS = 60_000;

export function nativite(options: NativiteVitestProviderOptions): NativiteBrowserProvider {
  assertSupportedVitestVersion(options.vitestVersion);

  const coordinator = new NativiteCoordinatorClient(options);
  const activeSessions = new Set<string>();

  return {
    name: "nativite",
    supportsParallelism: false,
    getCommandsContext(sessionId: string): NativiteCommandsContext {
      return createCommandsContext(coordinator, sessionId);
    },
    async openPage(sessionId: string, url: string, _openOptions?: unknown): Promise<void> {
      await coordinator.command(sessionId, "open-page", {
        url,
        platform: options.platform,
        device: options.device,
        testUrl: options.testUrl ?? url,
        sessionId: options.sessionId ?? sessionId,
        sessionToken: options.sessionToken,
        artifactsDir: options.artifactsDir,
        launchTimeoutMs: options.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS,
        watch: options.watch ?? false,
      });
      activeSessions.add(sessionId);
    },
    async close(): Promise<void> {
      const sessionIds = [...activeSessions];
      activeSessions.clear();
      await Promise.allSettled(
        sessionIds.map((sessionId) => coordinator.command(sessionId, "close", null)),
      );
    },
  };
}

function createCommandsContext(
  coordinator: NativiteCoordinatorClient,
  sessionId: string,
): NativiteCommandsContext {
  return {
    emit(event: string, data?: unknown): Promise<void> {
      return coordinator.command(sessionId, "emit", { event, data });
    },
    emitChromeEvent(event: NativiteChromeEventInput): Promise<void> {
      return coordinator.command(sessionId, "chrome-event", event);
    },
    latestSnapshot(): Promise<NativiteChromeSnapshot | undefined> {
      return coordinator.command(sessionId, "latest-snapshot", null);
    },
    geometry(target: string): Promise<unknown> {
      return coordinator.command(sessionId, "geometry", { target });
    },
    screenshot(name?: string): Promise<NativiteArtifact> {
      return coordinator.command(sessionId, "screenshot", { name });
    },
    nativeLogs(): Promise<readonly NativiteLogEntry[]> {
      return coordinator.command(sessionId, "native-logs", null);
    },
  };
}

class NativiteCoordinatorClient {
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;

  constructor(options: NativiteVitestProviderOptions) {
    this.#endpoint =
      options.coordinator?.endpoint ??
      getProcessEnv("NATIVITE_COORDINATOR_URL") ??
      DEFAULT_COORDINATOR_ENDPOINT;
    this.#fetch = options.fetch ?? globalThis.fetch;

    if (!this.#fetch) {
      throw new Error("Nativite Vitest provider requires a fetch implementation.");
    }
  }

  async command<T>(sessionId: string, command: string, payload: unknown): Promise<T> {
    const body: CoordinatorCommandBody = { sessionId, command, payload };
    const response = await this.#fetch(this.#endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Nativite coordinator command ${command} failed with HTTP ${response.status}.`,
      );
    }

    const result = await response.json();
    if (isCoordinatorFailure(result)) {
      throw new Error(result.error);
    }
    if (isCoordinatorResult(result)) return result.result as T;
    return result as T;
  }
}

function assertSupportedVitestVersion(version: string | undefined): void {
  if (!version) return;

  const major = Number.parseInt(version.replace(/^v/, ""), 10);
  if (major !== SUPPORTED_VITEST_MAJOR) {
    throw new Error(
      `Nativite Vitest provider supports Vitest ${SUPPORTED_VITEST_MAJOR}.x. ` +
        `Installed Vitest version ${version} is not supported.`,
    );
  }
}

function getProcessEnv(name: string): string | undefined {
  const env =
    typeof process === "undefined"
      ? undefined
      : (process as { readonly env?: Record<string, string | undefined> }).env;
  const value = env?.[name];
  return value && value.length > 0 ? value : undefined;
}

function isCoordinatorFailure(value: unknown): value is { readonly error: string } {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { readonly error?: unknown }).error === "string";
}

function isCoordinatorResult(value: unknown): value is { readonly result: unknown } {
  return typeof value === "object" && value !== null && "result" in value;
}
