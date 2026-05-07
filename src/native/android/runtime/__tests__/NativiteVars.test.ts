import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const kt = await Bun.file(join(import.meta.dirname, "../NativiteVars.kt")).text();

describe("NativiteVars.kt", () => {
  it("observes only keyboard insets, not system bar insets", () => {
    expect(kt).toContain("WindowInsetsCompat.Type.ime()");
    expect(kt).not.toContain("WindowInsetsCompat.Type.systemBars()");
  });

  it("updates keyboard variables on inset change", () => {
    expect(kt).toContain('"--nv-keyboard-height"');
    expect(kt).toContain('"--nv-keyboard-visible"');
    expect(kt).toContain('"--nv-keyboard-inset"');
  });

  it("updates device/orientation/theme flags from runtime configuration", () => {
    expect(kt).toContain("updateEnvironmentVars()");
    expect(kt).toContain("Configuration.UI_MODE_NIGHT_MASK");
    expect(kt).toContain('"--nv-is-phone"');
    expect(kt).toContain('"--nv-is-tablet"');
    expect(kt).toContain('"--nv-is-portrait"');
    expect(kt).toContain('"--nv-is-landscape"');
    expect(kt).toContain('"--nv-is-dark"');
    expect(kt).toContain('"--nv-is-light"');
    expect(kt).toContain('"--nv-font-scale"');
  });

  it("requests insets and listens to layout changes for live env updates", () => {
    expect(kt).toContain("webView.addOnLayoutChangeListener");
    expect(kt).toContain("ViewCompat.requestApplyInsets(webView)");
  });

  it("does not set safe area variables from system bars", () => {
    expect(kt).not.toContain("--nv-safe-area-top");
    expect(kt).not.toContain("--nv-safe-area-bottom");
    expect(kt).not.toContain("--nv-safe-area-left");
    expect(kt).not.toContain("--nv-safe-area-right");
  });

  it("flushes via __nv_patch helper", () => {
    expect(kt).toContain("window.__nv_patch");
  });

  it("clears lastVars after flush", () => {
    expect(kt).toContain("lastVars.clear()");
  });

  describe("buildInitScript", () => {
    it("creates a style element with __nv_vars__ id", () => {
      expect(kt).toContain("s.id='__nv_vars__'");
    });

    it("defines the __nv_patch helper function", () => {
      expect(kt).toContain("window.__nv_patch=function(vars,attrs)");
    });

    it("defaults safe area variables to 0px", () => {
      expect(kt).toContain("--nv-safe-top:0px");
      expect(kt).toContain("--nv-safe-bottom:0px");
      expect(kt).toContain("--nv-safe-left:0px");
      expect(kt).toContain("--nv-safe-right:0px");
    });

    it("defaults chrome geometry variables to 0", () => {
      expect(kt).toContain("--nv-nav-height:0px");
      expect(kt).toContain("--nv-nav-visible:0");
      expect(kt).toContain("--nv-tab-height:0px");
      expect(kt).toContain("--nv-tab-visible:0");
      expect(kt).toContain("--nv-toolbar-height:0px");
      expect(kt).toContain("--nv-toolbar-visible:0");
      expect(kt).toContain("--nv-status-height:0px");
    });

    it("defaults inset variables to 0px", () => {
      expect(kt).toContain("--nv-inset-top:0px");
      expect(kt).toContain("--nv-inset-bottom:0px");
      expect(kt).toContain("--nv-inset-left:0px");
      expect(kt).toContain("--nv-inset-right:0px");
    });

    it("defaults keyboard variables to 0", () => {
      expect(kt).toContain("--nv-keyboard-height:0px");
      expect(kt).toContain("--nv-keyboard-visible:0");
      expect(kt).toContain("--nv-keyboard-inset:0px");
    });

    it("defaults device type to phone", () => {
      expect(kt).toContain("--nv-is-phone:1");
      expect(kt).toContain("--nv-is-tablet:0");
      expect(kt).toContain("--nv-is-desktop:0");
    });

    it("defaults theme to light", () => {
      expect(kt).toContain("--nv-is-dark:0");
      expect(kt).toContain("--nv-is-light:1");
    });

    it("declares color-scheme on :root so prefers-color-scheme media queries work", () => {
      expect(kt).toContain("color-scheme:light dark;");
    });

    it("sets data-nv-theme attribute on documentElement", () => {
      expect(kt).toContain("data-nv-theme");
      expect(kt).toContain("setAttribute('data-nv-theme'");
    });

    it("supports attrs parameter in __nv_patch helper", () => {
      expect(kt).toContain("window.__nv_patch=function(vars,attrs)");
      expect(kt).toContain("r.setAttribute(k,attrs[k])");
    });

    it("uses correct variable names without -area- infix", () => {
      expect(kt).toContain("--nv-safe-top:");
      expect(kt).not.toMatch(/--nv-safe-area-/);
    });
  });

  it("updates data-nv-theme attribute when environment vars change", () => {
    expect(kt).toContain('updateAttr("data-nv-theme"');
  });

  it("flushes attrs alongside vars", () => {
    expect(kt).toContain("lastAttrs");
    expect(kt).toContain("lastAttrs.clear()");
  });

  it("exposes pushCustomVars for external modules", () => {
    expect(kt).toContain("fun pushCustomVars(vars: Map<String, String>)");
  });

  it("deduplicates variable updates via updateVar", () => {
    expect(kt).toContain("fun updateVar(name: String, value: String)");
    expect(kt).toContain("lastVars[name] != value");
  });
});
