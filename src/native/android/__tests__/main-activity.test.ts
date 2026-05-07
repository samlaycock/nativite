import { describe, expect, it } from "bun:test";

import { androidConfig, androidSplashConfig } from "../../../__tests__/fixtures.ts";
import { mainActivityTemplate } from "../main-activity.ts";

describe("mainActivityTemplate", () => {
  it("uses the correct package name", () => {
    const output = mainActivityTemplate(androidConfig);
    expect(output).toContain("package com.example.testapp");
  });

  it("extends ComponentActivity", () => {
    const output = mainActivityTemplate(androidConfig);
    expect(output).toContain("class MainActivity : ComponentActivity()");
  });

  it("calls enableEdgeToEdge", () => {
    const output = mainActivityTemplate(androidConfig);
    expect(output).toContain("enableEdgeToEdge()");
  });

  it("sets up NativiteTheme and NativiteApp", () => {
    const output = mainActivityTemplate(androidConfig);
    expect(output).toContain("NativiteTheme {");
    expect(output).toContain("NativiteApp(bridge = bridge)");
  });

  it("excludes splash screen import when no splash config", () => {
    const output = mainActivityTemplate(androidConfig);
    expect(output).not.toContain("installSplashScreen");
  });

  it("includes splash screen when splash is configured", () => {
    const output = mainActivityTemplate(androidSplashConfig);
    expect(output).toContain("installSplashScreen()");
    expect(output).toContain("import androidx.core.splashscreen.SplashScreen");
  });
});
