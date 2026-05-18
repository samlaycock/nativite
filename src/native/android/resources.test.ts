import { describe, expect, it } from "bun:test";

import { androidSplashConfig } from "../../../test/fixtures.ts";
import { themesXmlTemplate } from "./resources.ts";
import { splashScreenTemplate } from "./splash-screen.ts";

describe("Android resources", () => {
  it("defines the splash theme only in splash.xml", () => {
    const themes = themesXmlTemplate(androidSplashConfig);
    const splash = splashScreenTemplate(androidSplashConfig);

    expect(themes).not.toContain('name="Theme.TestApp.Splash"');
    expect(splash).toContain('name="Theme.TestApp.Splash"');
  });
});
