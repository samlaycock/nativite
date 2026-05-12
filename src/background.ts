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
  readonly platforms: Record<string, unknown>;
};

export type BackgroundTaskManifest = {
  readonly version: 1;
  readonly tasks: BackgroundTaskManifestEntry[];
};

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
