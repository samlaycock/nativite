export interface BackgroundTaskPlatformOptions {
  readonly [platform: string]: unknown;
}

export type BackgroundTaskRunnerContext<TPayload = unknown> = {
  readonly taskId: string;
  readonly payload?: TPayload;
  readonly signal?: AbortSignal;
  readonly storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  readonly fetch: typeof fetch;
  readonly log: Pick<Console, "debug" | "error" | "info" | "warn">;
};

export type BackgroundTaskRunner<TPayload = unknown> = (
  ctx: BackgroundTaskRunnerContext<TPayload>,
) => void | Promise<void>;

export type BackgroundTaskDefinition<TPayload = unknown> = {
  readonly id: string;
  readonly run: BackgroundTaskRunner<TPayload>;
} & Partial<BackgroundTaskPlatformOptions>;

export type BackgroundTaskManifestEntry = {
  readonly id: string;
  readonly bundle: string;
  readonly platforms: Readonly<Record<string, unknown>>;
};

export type BackgroundTaskManifest = {
  readonly version: 1;
  readonly tasks: readonly BackgroundTaskManifestEntry[];
};

export type BackgroundTaskPayload =
  | null
  | boolean
  | number
  | string
  | readonly BackgroundTaskPayload[]
  | { readonly [key: string]: BackgroundTaskPayload };

export interface BackgroundTaskScheduleOptions {
  readonly payload?: BackgroundTaskPayload;
}

export interface BackgroundTaskStatus {
  readonly id: string;
  readonly state: "unknown" | "scheduled" | "running" | "cancelled" | "completed" | "failed";
  readonly platform?: string;
}

export interface BackgroundTaskBridge {
  call(namespace: string, method: string, params?: unknown): Promise<unknown>;
}

export type BackgroundTaskRegistration = string | { readonly path: string };

export function defineBackgroundTask<TPayload = unknown>(
  task: BackgroundTaskDefinition<TPayload>,
): BackgroundTaskDefinition<TPayload> {
  return task;
}

export function backgroundTaskPath(registration: BackgroundTaskRegistration): string {
  return typeof registration === "string" ? registration : registration.path;
}

export function createBackgroundTaskManifestEntry(
  task: BackgroundTaskDefinition,
  bundle: string,
): BackgroundTaskManifestEntry {
  const platforms: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(task)) {
    if (key !== "id" && key !== "run" && value !== undefined) {
      platforms[key] = value;
    }
  }

  return {
    id: task.id,
    bundle,
    platforms,
  };
}

export function createBackgroundTaskManifest(
  entries: readonly BackgroundTaskManifestEntry[],
): BackgroundTaskManifest {
  return {
    version: 1,
    tasks: [...entries],
  };
}

function assertTaskId(taskId: string): void {
  if (taskId.length === 0) {
    throw new TypeError("Background task id must be a non-empty string.");
  }
}

function assertSerializablePayload(payload: BackgroundTaskPayload | undefined): void {
  if (payload === undefined) return;
  try {
    JSON.stringify(payload);
  } catch (err) {
    throw new TypeError("Background task payload must be JSON serializable.", { cause: err });
  }
}

function createBackgroundRuntime(activeBridge: BackgroundTaskBridge) {
  return {
    async schedule(taskId: string, options: BackgroundTaskScheduleOptions = {}): Promise<void> {
      assertTaskId(taskId);
      assertSerializablePayload(options.payload);
      await activeBridge.call("__background__", "schedule", {
        id: taskId,
        payload: JSON.stringify(options.payload ?? null),
      });
    },

    async cancel(taskId: string): Promise<void> {
      assertTaskId(taskId);
      await activeBridge.call("__background__", "cancel", { id: taskId });
    },

    async getStatus(taskId: string): Promise<BackgroundTaskStatus> {
      assertTaskId(taskId);
      const result = await activeBridge.call("__background__", "getStatus", { id: taskId });
      return result as BackgroundTaskStatus;
    },
  } as const;
}

const defaultBackgroundBridge: BackgroundTaskBridge = {
  async call(namespace, method, params) {
    const { bridge } = await import("./client/index.ts");
    return bridge.call(namespace, method, params);
  },
};

export const background = createBackgroundRuntime(defaultBackgroundBridge);

export const createBackgroundForTesting = createBackgroundRuntime;
