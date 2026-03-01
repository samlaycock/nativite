import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import type { NativiteConfig } from "../index.ts";
import type { NativitePluginMode } from "../index.ts";

import { resolveConfigForPlatform } from "../platforms/registry.ts";
import { resolveNativitePlugins } from "../plugins/resolve.ts";
import { hashConfigForGeneration } from "./hash.ts";
import { androidManifestTemplate } from "./templates/android-manifest.ts";
import { appIconTemplate, appIconXmlTemplate } from "./templates/app-icon.ts";
import { buildGradleAppTemplate } from "./templates/build-gradle-app.ts";
import { buildGradleRootTemplate } from "./templates/build-gradle-root.ts";
import { gradlePropertiesTemplate } from "./templates/gradle-properties.ts";
import { gradleWrapperPropertiesTemplate } from "./templates/gradle-wrapper-properties.ts";
import { mainActivityTemplate } from "./templates/main-activity.ts";
import { nativiteBridgeTemplate } from "./templates/nativite-bridge.ts";
import { nativiteChromeTemplate } from "./templates/nativite-chrome.ts";
import { nativiteThemeTemplate } from "./templates/nativite-theme.ts";
import { nativiteVarsTemplate } from "./templates/nativite-vars.ts";
import { nativiteWebViewTemplate } from "./templates/nativite-webview.ts";
import { stringsXmlTemplate, colorsXmlTemplate, themesXmlTemplate } from "./templates/resources.ts";
import { settingsGradleTemplate } from "./templates/settings-gradle.ts";
import { splashScreenTemplate } from "./templates/splash-screen.ts";
import { versionCatalogTemplate } from "./templates/version-catalog.ts";

export interface GenerateResult {
  readonly skipped: boolean;
  readonly projectPath: string;
  readonly hash: string;
}

export async function generateProject(
  config: NativiteConfig,
  cwd: string,
  force = false,
  mode: NativitePluginMode = "generate",
): Promise<GenerateResult> {
  const nativiteDir = join(cwd, ".nativite");
  const hashFile = join(nativiteDir, ".hash-android");
  const projectRoot = join(nativiteDir, "android");
  const androidConfig = resolveConfigForPlatform(config, "android");
  const resolvedPlugins = await resolveNativitePlugins(config, cwd, mode);
  const hash = hashConfigForGeneration(config, resolvedPlugins);

  // Dirty check — skip if nothing has changed
  if (!force && existsSync(hashFile)) {
    const existingHash = readFileSync(hashFile, "utf-8").trim();
    if (existingHash === hash) {
      return {
        skipped: true,
        projectPath: projectRoot,
        hash,
      };
    }
  }

  const androidPlatform = (config.platforms ?? []).find((p) => p.platform === "android");
  const minSdk = (androidPlatform as { minSdk?: number } | undefined)?.minSdk ?? 26;
  const targetSdk = (androidPlatform as { targetSdk?: number } | undefined)?.targetSdk ?? 35;

  const packagePath = androidConfig.app.bundleId.split(".");
  const appDir = join(projectRoot, "app");
  const srcMainDir = join(appDir, "src", "main");
  const javaDir = join(srcMainDir, "java", ...packagePath);
  const resDir = join(srcMainDir, "res");
  const valuesDir = join(resDir, "values");
  const mipmapXxxhdpiDir = join(resDir, "mipmap-xxxhdpi");
  const mipmapAnydpiDir = join(resDir, "mipmap-anydpi-v26");
  const assetsDir = join(srcMainDir, "assets");
  const gradleWrapperDir = join(projectRoot, "gradle", "wrapper");

  for (const dir of [
    nativiteDir,
    projectRoot,
    appDir,
    srcMainDir,
    javaDir,
    resDir,
    valuesDir,
    mipmapXxxhdpiDir,
    mipmapAnydpiDir,
    assetsDir,
    gradleWrapperDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  // Root build files
  writeFileSync(join(projectRoot, "build.gradle.kts"), buildGradleRootTemplate());
  writeFileSync(
    join(projectRoot, "settings.gradle.kts"),
    settingsGradleTemplate(androidConfig.app.name),
  );
  writeFileSync(join(projectRoot, "gradle.properties"), gradlePropertiesTemplate());
  writeFileSync(
    join(gradleWrapperDir, "gradle-wrapper.properties"),
    gradleWrapperPropertiesTemplate(),
  );

  // Version catalog
  const gradleDir = join(projectRoot, "gradle");
  mkdirSync(gradleDir, { recursive: true });
  writeFileSync(join(gradleDir, "libs.versions.toml"), versionCatalogTemplate());

  // App module build file
  writeFileSync(
    join(appDir, "build.gradle.kts"),
    buildGradleAppTemplate(androidConfig, minSdk, targetSdk),
  );

  // Android manifest
  writeFileSync(join(srcMainDir, "AndroidManifest.xml"), androidManifestTemplate(androidConfig));

  // Kotlin source files
  writeFileSync(join(javaDir, "MainActivity.kt"), mainActivityTemplate(androidConfig));
  writeFileSync(join(javaDir, "NativiteBridge.kt"), nativiteBridgeTemplate(androidConfig));
  writeFileSync(join(javaDir, "NativiteChrome.kt"), nativiteChromeTemplate(androidConfig));
  writeFileSync(join(javaDir, "NativiteWebView.kt"), nativiteWebViewTemplate(androidConfig));
  writeFileSync(join(javaDir, "NativiteVars.kt"), nativiteVarsTemplate(androidConfig));
  writeFileSync(join(javaDir, "NativiteTheme.kt"), nativiteThemeTemplate(androidConfig));

  // Resources
  writeFileSync(join(valuesDir, "strings.xml"), stringsXmlTemplate(androidConfig));
  writeFileSync(join(valuesDir, "colors.xml"), colorsXmlTemplate());
  writeFileSync(join(valuesDir, "themes.xml"), themesXmlTemplate(androidConfig));

  // Splash screen
  if (androidConfig.splash) {
    writeFileSync(join(valuesDir, "splash.xml"), splashScreenTemplate(androidConfig));
  }

  // App icon
  if (androidConfig.icon) {
    const sourceIconPath = resolve(cwd, androidConfig.icon);
    const iconFilename = basename(sourceIconPath);
    copyFileSync(sourceIconPath, join(mipmapXxxhdpiDir, iconFilename));
    writeFileSync(join(mipmapAnydpiDir, "ic_launcher.xml"), appIconXmlTemplate());
  } else {
    writeFileSync(join(mipmapAnydpiDir, "ic_launcher.xml"), appIconXmlTemplate());
  }
  writeFileSync(join(mipmapXxxhdpiDir, "ic_launcher_foreground.png"), appIconTemplate());

  writeFileSync(hashFile, hash);

  return {
    skipped: false,
    projectPath: projectRoot,
    hash,
  };
}
