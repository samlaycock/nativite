import { describe, expect, it } from "bun:test";

import { baseConfig } from "../../../__tests__/fixtures.ts";
import { appDelegateTemplate } from "../app-delegate.ts";

describe("appDelegateTemplate", () => {
  it("wraps ViewController in UINavigationController so chrome APIs have a navigationController to mutate", () => {
    const output = appDelegateTemplate(baseConfig);
    // NativiteChrome.applyNavigationBar/applyToolbar/applySearchBar all guard on
    // vc.navigationController — if the root ViewController is set directly without
    // a UINavigationController wrapper those guards fail silently and every chrome
    // API call that touches the nav bar, toolbar, or search bar does nothing.
    expect(output).toContain("UINavigationController(rootViewController: ViewController())");
  });

  it("does not set ViewController as the root view controller directly", () => {
    const output = appDelegateTemplate(baseConfig);
    // Setting ViewController() as rootViewController directly (without wrapping it
    // in a UINavigationController) leaves vc.navigationController nil, silently
    // breaking all chrome navigation bar / toolbar / search bar mutations.
    expect(output).not.toContain("rootViewController = ViewController()");
  });

  it("starts with the navigation bar hidden so the app loads as full-screen WebView by default", () => {
    const output = appDelegateTemplate(baseConfig);
    // The navigation bar should be hidden until the JS layer shows it via
    // chrome.navigationBar.show() / chrome.navigationBar.setTitle(...). Showing an empty bar on
    // startup would be a visual regression for apps that never use a nav bar.
    expect(output).toContain("setNavigationBarHidden(true");
  });
});
