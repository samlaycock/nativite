import { execSync } from "node:child_process";

export type SimulatorStatus = "running" | "stopped";

type StatusChangeHandler = (platformId: string, status: SimulatorStatus) => void;

export interface StatusPoller {
  readonly statuses: ReadonlyMap<string, SimulatorStatus>;
  readonly onStatusChange: (handler: StatusChangeHandler) => () => void;
  readonly poll: () => void;
  readonly close: () => void;
}

interface StatusPollerOptions {
  readonly platformIds: ReadonlyArray<string>;
  readonly appName: string;
  readonly interval?: number;
}

const DEFAULT_POLL_INTERVAL = 2000;

function checkIosSimulatorRunning(): boolean {
  try {
    const output = execSync("xcrun simctl list devices booted --json", {
      stdio: "pipe",
      timeout: 5000,
    }).toString();
    const parsed = JSON.parse(output) as { devices?: Record<string, unknown[]> };
    if (!parsed.devices) return false;
    return Object.values(parsed.devices).some((devices) => devices.length > 0);
  } catch {
    return false;
  }
}

function checkAndroidDeviceConnected(): boolean {
  try {
    const output = execSync("adb devices", {
      stdio: "pipe",
      timeout: 5000,
    }).toString();
    return output.split("\n").some((line) => /\t(device|emulator)$/.test(line.trim()));
  } catch {
    return false;
  }
}

function checkMacosAppRunning(appName: string): boolean {
  try {
    const output = execSync(`pgrep -f "${appName}.app/Contents/MacOS/"`, {
      stdio: "pipe",
      timeout: 5000,
    }).toString();
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function checkPlatformStatus(platformId: string, appName: string): SimulatorStatus {
  switch (platformId) {
    case "ios":
    case "ipad":
      return checkIosSimulatorRunning() ? "running" : "stopped";
    case "android":
      return checkAndroidDeviceConnected() ? "running" : "stopped";
    case "macos":
      return checkMacosAppRunning(appName) ? "running" : "stopped";
    default:
      return "stopped";
  }
}

export function createStatusPoller(options: StatusPollerOptions): StatusPoller {
  const { platformIds, appName, interval = DEFAULT_POLL_INTERVAL } = options;
  const statuses = new Map<string, SimulatorStatus>();
  const handlers = new Set<StatusChangeHandler>();
  let timer: ReturnType<typeof setInterval> | undefined;

  for (const id of platformIds) {
    statuses.set(id, "stopped");
  }

  function poll(): void {
    for (const id of platformIds) {
      const prev = statuses.get(id);
      const current = checkPlatformStatus(id, appName);
      if (current !== prev) {
        statuses.set(id, current);
        for (const handler of handlers) {
          handler(id, current);
        }
      }
    }
  }

  function onStatusChange(handler: StatusChangeHandler): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  function close(): void {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    handlers.clear();
  }

  // Run initial poll and start interval
  poll();
  timer = setInterval(poll, interval);

  return {
    statuses,
    onStatusChange,
    poll,
    close,
  };
}
