import { describe, expect, it } from "bun:test";

import { androidConfig } from "../../../__tests__/fixtures.ts";
import { nativiteVarsTemplate } from "../nativite-vars.ts";

describe("nativiteVarsTemplate", () => {
  it("uses the correct package name", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("package com.example.testapp");
  });

  it("observes only keyboard insets, not system bar insets", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("WindowInsetsCompat.Type.ime()");
    expect(output).not.toContain("WindowInsetsCompat.Type.systemBars()");
  });

  it("updates keyboard variables on inset change", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain('"--nk-keyboard-height"');
    expect(output).toContain('"--nk-keyboard-visible"');
    expect(output).toContain('"--nk-keyboard-inset"');
  });

  it("does not set safe area variables from system bars", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).not.toContain("--nk-safe-area-top");
    expect(output).not.toContain("--nk-safe-area-bottom");
    expect(output).not.toContain("--nk-safe-area-left");
    expect(output).not.toContain("--nk-safe-area-right");
  });

  it("flushes via __nk_patch helper", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("window.__nk_patch");
  });

  it("clears lastVars after flush", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("lastVars.clear()");
  });

  describe("buildInitScript", () => {
    it("creates a style element with __nk_vars__ id", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("s.id='__nk_vars__'");
    });

    it("defines the __nk_patch helper function", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("window.__nk_patch=function(vars)");
    });

    it("defaults safe area variables to 0px", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nk-safe-top:0px");
      expect(output).toContain("--nk-safe-bottom:0px");
      expect(output).toContain("--nk-safe-left:0px");
      expect(output).toContain("--nk-safe-right:0px");
    });

    it("defaults chrome geometry variables to 0", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nk-nav-height:0px");
      expect(output).toContain("--nk-nav-visible:0");
      expect(output).toContain("--nk-tab-height:0px");
      expect(output).toContain("--nk-tab-visible:0");
      expect(output).toContain("--nk-toolbar-height:0px");
      expect(output).toContain("--nk-toolbar-visible:0");
      expect(output).toContain("--nk-status-height:0px");
    });

    it("defaults inset variables to 0px", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nk-inset-top:0px");
      expect(output).toContain("--nk-inset-bottom:0px");
      expect(output).toContain("--nk-inset-left:0px");
      expect(output).toContain("--nk-inset-right:0px");
    });

    it("defaults keyboard variables to 0", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nk-keyboard-height:0px");
      expect(output).toContain("--nk-keyboard-visible:0");
      expect(output).toContain("--nk-keyboard-inset:0px");
    });

    it("defaults device type to phone", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nk-is-phone:1");
      expect(output).toContain("--nk-is-tablet:0");
      expect(output).toContain("--nk-is-desktop:0");
    });

    it("defaults theme to light", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nk-is-dark:0");
      expect(output).toContain("--nk-is-light:1");
    });

    it("uses correct iOS-compatible variable names", () => {
      const output = nativiteVarsTemplate(androidConfig);
      // Should use --nk-safe-top, NOT --nk-safe-area-top
      expect(output).toContain("--nk-safe-top:");
      expect(output).not.toMatch(/--nk-safe-area-/);
    });
  });

  it("exposes pushCustomVars for external modules", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("fun pushCustomVars(vars: Map<String, String>)");
  });

  it("deduplicates variable updates via updateVar", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("fun updateVar(name: String, value: String)");
    expect(output).toContain("lastVars[name] != value");
  });
});
