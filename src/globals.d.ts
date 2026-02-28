/**
 * Ambient type declarations for the globals injected by Nativite's Vite plugin.
 *
 * Add a reference directive to your project's `vite-env.d.ts` (or any `.d.ts`
 * file included by your `tsconfig.json`) to make these globals available:
 *
 * @example
 * // vite-env.d.ts
 * /// <reference types="vite/client" />
 * /// <reference types="nativite/globals" />
 */

/** The active Nativite platform for this build. */
declare const __PLATFORM__: "ios" | "ipad" | "macos" | "web" | (string & {});

/** `true` when the app is running inside a Nativite native shell, `false` in a browser. */
declare const __IS_NATIVE__: boolean;

/** `true` in development mode (`vite dev`), `false` in production (`vite build`). */
declare const __DEV__: boolean;
