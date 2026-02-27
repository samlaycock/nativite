import { describe, expect, it } from "bun:test";

import {
  baseConfig,
  pluginsSortedConfig,
  pluginsUnsortedConfig,
} from "../../__tests__/fixtures.ts";
import { hashConfig } from "../hash.ts";

describe("hashConfig", () => {
  // ── Determinism ──────────────────────────────────────────────────────────────

  it("returns the same hash for the same config called twice", () => {
    expect(hashConfig(baseConfig)).toBe(hashConfig(baseConfig));
  });

  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashConfig(baseConfig);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── Plugin order independence ─────────────────────────────────────────────────

  it("produces the same hash regardless of plugin array order", () => {
    expect(hashConfig(pluginsUnsortedConfig)).toBe(hashConfig(pluginsSortedConfig));
  });

  it("produces a different hash when plugin names differ", () => {
    const configA = { ...baseConfig, plugins: [{ name: "plugin-a" }] };
    const configB = { ...baseConfig, plugins: [{ name: "plugin-b" }] };
    expect(hashConfig(configA)).not.toBe(hashConfig(configB));
  });

  // ── Sensitivity to config changes ────────────────────────────────────────────

  it("produces a different hash when app.name changes", () => {
    const configA = { ...baseConfig };
    const configB = { ...baseConfig, app: { ...baseConfig.app, name: "OtherApp" } };
    expect(hashConfig(configA)).not.toBe(hashConfig(configB));
  });

  it("produces a different hash when app.bundleId changes", () => {
    const configA = { ...baseConfig };
    const configB = {
      ...baseConfig,
      app: { ...baseConfig.app, bundleId: "com.other.app" },
    };
    expect(hashConfig(configA)).not.toBe(hashConfig(configB));
  });

  it("produces a different hash when app.version changes", () => {
    const configA = { ...baseConfig };
    const configB = { ...baseConfig, app: { ...baseConfig.app, version: "2.0.0" } };
    expect(hashConfig(configA)).not.toBe(hashConfig(configB));
  });

  it("produces a different hash when app.buildNumber changes", () => {
    const configA = { ...baseConfig };
    const configB = { ...baseConfig, app: { ...baseConfig.app, buildNumber: 42 } };
    expect(hashConfig(configA)).not.toBe(hashConfig(configB));
  });

  it("produces a different hash when updates config is added", () => {
    const withoutUpdates = { ...baseConfig };
    const withUpdates = {
      ...baseConfig,
      updates: { url: "https://updates.example.com", channel: "prod" },
    };
    expect(hashConfig(withoutUpdates)).not.toBe(hashConfig(withUpdates));
  });

  it("produces a different hash when splash config is added", () => {
    const withoutSplash = { ...baseConfig };
    const withSplash = {
      ...baseConfig,
      splash: { backgroundColor: "#FFFFFF", image: "" },
    };
    expect(hashConfig(withoutSplash)).not.toBe(hashConfig(withSplash));
  });

  // ── Plugin normalisation edge cases ──────────────────────────────────────────

  it("treats undefined plugins and empty plugins array as the same hash", () => {
    const withUndefinedPlugins = { ...baseConfig };
    const withEmptyPlugins = { ...baseConfig, plugins: [] };
    // Both normalise to sorted empty array before hashing
    expect(hashConfig(withUndefinedPlugins)).toBe(hashConfig(withEmptyPlugins));
  });

  it("sorts plugins with the same prefix by full name", () => {
    const configA = {
      ...baseConfig,
      plugins: [{ name: "plugin-b" }, { name: "plugin-a" }],
    };
    const configB = {
      ...baseConfig,
      plugins: [{ name: "plugin-a" }, { name: "plugin-b" }],
    };
    expect(hashConfig(configA)).toBe(hashConfig(configB));
  });
});
