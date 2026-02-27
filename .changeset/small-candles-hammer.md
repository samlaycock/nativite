---
"nativite": patch
---

Remove legacy/deprecated API compatibility paths and keep the supported API surface focused:

- Stop synthesizing `app.platforms` in parsed config output. `platforms` is now the single source of truth for configured platforms.
- Remove internal/runtime reliance on `config.app.platforms` across generation, Vite integration, plugin resolution, and platform override logic.
- Remove the legacy bridge RPC fallback path that depended on `window.nativiteReceive` `response/error` messages.
- Keep bridge RPC calls on the current `postMessageWithReply` API and use `window.nativiteReceive` for native push events only.
- Update test fixtures and schema expectations to reflect the simplified, forward-only API model.
