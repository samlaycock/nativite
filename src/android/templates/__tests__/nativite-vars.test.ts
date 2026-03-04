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
    expect(output).toContain('"--nv-keyboard-height"');
    expect(output).toContain('"--nv-keyboard-visible"');
    expect(output).toContain('"--nv-keyboard-inset"');
  });

  it("updates device/orientation/theme flags from runtime configuration", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("updateEnvironmentVars()");
    expect(output).toContain("Configuration.UI_MODE_NIGHT_MASK");
    expect(output).toContain('"--nv-is-phone"');
    expect(output).toContain('"--nv-is-tablet"');
    expect(output).toContain('"--nv-is-portrait"');
    expect(output).toContain('"--nv-is-landscape"');
    expect(output).toContain('"--nv-is-dark"');
    expect(output).toContain('"--nv-is-light"');
    expect(output).toContain('"--nv-font-scale"');
  });

  it("requests insets and listens to layout changes for live env updates", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("webView.addOnLayoutChangeListener");
    expect(output).toContain("ViewCompat.requestApplyInsets(webView)");
  });

  it("does not set safe area variables from system bars", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).not.toContain("--nv-safe-area-top");
    expect(output).not.toContain("--nv-safe-area-bottom");
    expect(output).not.toContain("--nv-safe-area-left");
    expect(output).not.toContain("--nv-safe-area-right");
  });

  it("flushes via __nv_patch helper", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("window.__nv_patch");
  });

  it("clears lastVars after flush", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("lastVars.clear()");
  });

  describe("buildInitScript", () => {
    it("creates a style element with __nv_vars__ id", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("s.id='__nv_vars__'");
    });

    it("defines the __nv_patch helper function", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("window.__nv_patch=function(vars,attrs)");
    });

    it("defaults safe area variables to 0px", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nv-safe-top:0px");
      expect(output).toContain("--nv-safe-bottom:0px");
      expect(output).toContain("--nv-safe-left:0px");
      expect(output).toContain("--nv-safe-right:0px");
    });

    it("defaults chrome geometry variables to 0", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nv-nav-height:0px");
      expect(output).toContain("--nv-nav-visible:0");
      expect(output).toContain("--nv-tab-height:0px");
      expect(output).toContain("--nv-tab-visible:0");
      expect(output).toContain("--nv-toolbar-height:0px");
      expect(output).toContain("--nv-toolbar-visible:0");
      expect(output).toContain("--nv-status-height:0px");
    });

    it("defaults inset variables to 0px", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nv-inset-top:0px");
      expect(output).toContain("--nv-inset-bottom:0px");
      expect(output).toContain("--nv-inset-left:0px");
      expect(output).toContain("--nv-inset-right:0px");
    });

    it("defaults keyboard variables to 0", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nv-keyboard-height:0px");
      expect(output).toContain("--nv-keyboard-visible:0");
      expect(output).toContain("--nv-keyboard-inset:0px");
    });

    it("defaults device type to phone", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nv-is-phone:1");
      expect(output).toContain("--nv-is-tablet:0");
      expect(output).toContain("--nv-is-desktop:0");
    });

    it("defaults theme to light", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("--nv-is-dark:0");
      expect(output).toContain("--nv-is-light:1");
    });

    it("declares color-scheme on :root so prefers-color-scheme media queries work", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("color-scheme:light dark;");
    });

    it("sets data-nv-theme attribute on documentElement", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("data-nv-theme");
      expect(output).toContain("setAttribute('data-nv-theme'");
    });

    it("supports attrs parameter in __nv_patch helper", () => {
      const output = nativiteVarsTemplate(androidConfig);
      expect(output).toContain("window.__nv_patch=function(vars,attrs)");
      expect(output).toContain("r.setAttribute(k,attrs[k])");
    });

    it("uses correct iOS-compatible variable names", () => {
      const output = nativiteVarsTemplate(androidConfig);
      // Should use --nv-safe-top, NOT --nv-safe-area-top
      expect(output).toContain("--nv-safe-top:");
      expect(output).not.toMatch(/--nv-safe-area-/);
    });
  });

  it("updates data-nv-theme attribute when environment vars change", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain('updateAttr("data-nv-theme"');
  });

  it("flushes attrs alongside vars", () => {
    const output = nativiteVarsTemplate(androidConfig);
    expect(output).toContain("lastAttrs");
    expect(output).toContain("lastAttrs.clear()");
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
