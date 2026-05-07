import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const kt = await Bun.file(join(import.meta.dirname, "NativiteVars.kt")).text();
const sharedCssVars = await Bun.file(
  join(import.meta.dirname, "../../../css-vars/index.ts"),
).text();

function extractSharedVarNames(source: string): string[] {
  const unionMatch = source.match(/export type NVVarName =([\s\S]*?)\n\n\/\/ ─── Default values/);
  if (!unionMatch) return [];
  const unionBody = unionMatch[1];
  if (!unionBody) return [];
  return [...unionBody.matchAll(/\|\s+"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
}

function extractAndroidDefaultVars(source: string): string[] {
  const defaultsMatch = source.match(/s\.textContent=':root\{([^']+)';/);
  if (!defaultsMatch) return [];
  const defaults = defaultsMatch[1];
  if (!defaults) return [];
  return [...defaults.matchAll(/--nv-([a-zA-Z0-9-]+):/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
}

describe("NativiteVars.kt", () => {
  it("tracks safe area and keyboard insets", () => {
    expect(kt).toContain("WindowInsetsCompat.Type.ime()");
    expect(kt).toContain("WindowInsetsCompat.Type.systemBars()");
    expect(kt).toContain("WindowInsetsCompat.Type.displayCutout()");
  });

  it("updates keyboard variables on inset change", () => {
    expect(kt).toContain('"--nv-keyboard-height"');
    expect(kt).toContain('"--nv-keyboard-visible"');
    expect(kt).toContain('"--nv-keyboard-floating"');
    expect(kt).toContain('"--nv-keyboard-inset"');
    expect(kt).toContain('"--nv-keyboard-duration"');
    expect(kt).toContain('"--nv-keyboard-curve"');
  });

  it("updates device/orientation/theme flags from runtime configuration", () => {
    expect(kt).toContain("updateEnvironmentVars()");
    expect(kt).toContain("Configuration.UI_MODE_NIGHT_MASK");
    expect(kt).toContain('"--nv-is-phone"');
    expect(kt).toContain('"--nv-is-tablet"');
    expect(kt).toContain('"--nv-is-portrait"');
    expect(kt).toContain('"--nv-is-landscape"');
    expect(kt).toContain('"--nv-display-scale"');
    expect(kt).toContain('"--nv-display-corner"');
    expect(kt).toContain('"--nv-is-compact-width"');
    expect(kt).toContain('"--nv-split-fraction"');
    expect(kt).toContain('"--nv-is-dark"');
    expect(kt).toContain('"--nv-is-light"');
    expect(kt).toContain('"--nv-contrast"');
    expect(kt).toContain('"--nv-reduced-motion"');
    expect(kt).toContain('"--nv-reduced-transparency"');
    expect(kt).toContain('"--nv-accent-r"');
    expect(kt).toContain('"--nv-accent-g"');
    expect(kt).toContain('"--nv-accent-b"');
    expect(kt).toContain('"--nv-accent"');
    expect(kt).toContain('"--nv-font-scale"');
  });

  it("requests insets and listens to layout changes for live env updates", () => {
    expect(kt).toContain("webView.addOnLayoutChangeListener");
    expect(kt).toContain("ViewCompat.requestApplyInsets(webView)");
  });

  it("animates keyboard variable updates with window inset animations", () => {
    expect(kt).toContain("WindowInsetsAnimationCompat.Callback");
    expect(kt).toContain("ViewCompat.setWindowInsetsAnimationCallback");
    expect(kt).toContain("override fun onProgress");
  });

  it("does not use legacy safe-area variable names", () => {
    expect(kt).not.toContain("--nv-safe-area-top");
    expect(kt).not.toContain("--nv-safe-area-bottom");
    expect(kt).not.toContain("--nv-safe-area-left");
    expect(kt).not.toContain("--nv-safe-area-right");
  });

  it("keeps the Android default variable set aligned with the shared NVVarName contract", () => {
    const sharedVars = extractSharedVarNames(sharedCssVars).sort();
    const androidVars = extractAndroidDefaultVars(kt).sort();

    expect(androidVars).toEqual(sharedVars);
  });

  it("does not expose undocumented sidebar css variables", () => {
    expect(kt).not.toContain("--nv-sidebar-width");
    expect(kt).not.toContain("--nv-sidebar-visible");
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

    it("defaults safe area variables to 0px before the first inset pass", () => {
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
      expect(kt).toContain("--nv-keyboard-floating:0");
      expect(kt).toContain("--nv-keyboard-inset:0px");
      expect(kt).toContain("--nv-keyboard-duration:250ms");
      expect(kt).toContain("--nv-keyboard-curve:ease-in-out");
    });

    it("defaults device type to phone", () => {
      expect(kt).toContain("--nv-is-phone:1");
      expect(kt).toContain("--nv-is-tablet:0");
      expect(kt).toContain("--nv-is-desktop:0");
    });

    it("defaults shared device and appearance variables", () => {
      expect(kt).toContain("--nv-display-scale:2");
      expect(kt).toContain("--nv-display-corner:0px");
      expect(kt).toContain("--nv-is-compact-width:0");
      expect(kt).toContain("--nv-split-fraction:1");
      expect(kt).toContain("--nv-accent-r:0");
      expect(kt).toContain("--nv-accent-g:122");
      expect(kt).toContain("--nv-accent-b:255");
      expect(kt).toContain(
        "--nv-accent:rgb(var(--nv-accent-r),var(--nv-accent-g),var(--nv-accent-b))",
      );
    });

    it("defaults shared navigation-state variables", () => {
      expect(kt).toContain("--nv-nav-depth:0");
      expect(kt).toContain("--nv-title-collapse:0");
      expect(kt).toContain("--nv-pop-gesture:0");
      expect(kt).toContain("--nv-sheet-visible:0");
      expect(kt).toContain("--nv-sheet-detent:0");
    });

    it("defaults shared font-size variables", () => {
      expect(kt).toContain("--nv-font-body:17px");
      expect(kt).toContain("--nv-font-callout:16px");
      expect(kt).toContain("--nv-font-caption1:12px");
      expect(kt).toContain("--nv-font-caption2:11px");
      expect(kt).toContain("--nv-font-footnote:13px");
      expect(kt).toContain("--nv-font-headline:17px");
      expect(kt).toContain("--nv-font-subheadline:15px");
      expect(kt).toContain("--nv-font-title1:28px");
      expect(kt).toContain("--nv-font-title2:22px");
      expect(kt).toContain("--nv-font-title3:20px");
      expect(kt).toContain("--nv-font-largeTitle:34px");
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
