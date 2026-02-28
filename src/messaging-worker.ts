/// <reference lib="webworker" />

// ─── Nativekit Shared Messaging Worker ───────────────────────────────────────
// Runs in a SharedWorker so all webview instances (main, sheets, drawers, etc.)
// in the same native shell share a single process. Messages are routed by the
// instance name each port registers with on connect.
//
// Message protocol (JS → worker):
//   { type: "register",    name: string }
//   { type: "postToParent", from: string, payload: unknown }
//   { type: "postToChild",  from: string, to: string, payload: unknown }
//   { type: "broadcast",   from: string, payload: unknown }
//
// Message protocol (worker → JS):
//   { type: "message", from: string, payload: unknown }

interface RegisterMessage {
  readonly type: "register";
  readonly name: string;
}

interface PostToParentMessage {
  readonly type: "postToParent";
  readonly from: string;
  readonly payload: unknown;
}

interface PostToChildMessage {
  readonly type: "postToChild";
  readonly from: string;
  readonly to: string;
  readonly payload: unknown;
}

interface BroadcastMessage {
  readonly type: "broadcast";
  readonly from: string;
  readonly payload: unknown;
}

type WorkerInboundMessage =
  | RegisterMessage
  | PostToParentMessage
  | PostToChildMessage
  | BroadcastMessage;

// Registry of all connected ports, keyed by instance name.
const ports = new Map<string, MessagePort>();

self.addEventListener("connect", (rawEvent: Event) => {
  const event = rawEvent as MessageEvent;
  const port = event.ports[0];
  if (!port) return;
  let myName: string | null = null;

  port.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data as WorkerInboundMessage;

    switch (msg.type) {
      case "register": {
        if (myName !== null) ports.delete(myName);
        myName = msg.name;
        ports.set(myName, port);
        break;
      }

      case "postToParent": {
        const main = ports.get("main");
        if (main && main !== port) {
          main.postMessage({ type: "message", from: msg.from, payload: msg.payload });
        }
        break;
      }

      case "postToChild": {
        const target = ports.get(msg.to);
        if (target && target !== port) {
          target.postMessage({ type: "message", from: msg.from, payload: msg.payload });
        }
        break;
      }

      case "broadcast": {
        for (const [, p] of ports) {
          if (p !== port) {
            p.postMessage({ type: "message", from: msg.from, payload: msg.payload });
          }
        }
        break;
      }
    }
  });

  port.start();
});
