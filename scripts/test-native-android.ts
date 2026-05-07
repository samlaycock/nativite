import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeDir = join(repoRoot, "src", "native", "android", "runtime");
const runtimeTestsDir = join(runtimeDir, "tests");
const packageName = "dev.nativite.runtime";

function writeFileWithPackage(sourcePath: string, targetPath: string): void {
  const source = readFileSync(sourcePath, "utf-8");
  writeFileSync(targetPath, `package ${packageName}\n\n${source}`);
}

function copyKotlinFiles(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".kt")) continue;
    writeFileWithPackage(join(sourceDir, entry.name), join(targetDir, entry.name));
  }
}

function writeSettings(projectDir: string): void {
  writeFileSync(
    join(projectDir, "settings.gradle.kts"),
    `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "nativite-android-runtime-tests"
`,
  );
}

function writeBuildFile(projectDir: string): void {
  writeFileSync(
    join(projectDir, "build.gradle.kts"),
    `plugins {
    id("com.android.library") version "8.7.3"
    id("org.jetbrains.kotlin.android") version "2.1.0"
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0"
}

android {
    namespace = "${packageName}"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-splashscreen:1.0.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
}
`,
  );
}

function writeGradleProperties(projectDir: string): void {
  writeFileSync(
    join(projectDir, "gradle.properties"),
    `android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
  );
}

function writeManifest(projectDir: string): void {
  const manifestDir = join(projectDir, "src", "main");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "AndroidManifest.xml"), `<manifest />\n`);
}

function writeGeneratedConfig(projectDir: string): void {
  const mainDir = join(projectDir, "src", "main", "java", ...packageName.split("."));
  mkdirSync(mainDir, { recursive: true });
  writeFileSync(
    join(mainDir, "NativiteConfig.kt"),
    `package ${packageName}

object NativiteConfig {
    val defaultChromeStateJSON: String? = null
}
`,
  );
}

function runGradleTests(projectDir: string): number {
  const result = spawnSync("gradle", ["testDebugUnitTest", "--no-daemon"], {
    cwd: projectDir,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

const projectDir = mkdtempSync(join(tmpdir(), "nativite-android-runtime-tests-"));

try {
  writeSettings(projectDir);
  writeBuildFile(projectDir);
  writeGradleProperties(projectDir);
  writeManifest(projectDir);
  writeGeneratedConfig(projectDir);

  const mainDir = join(projectDir, "src", "main", "java", ...packageName.split("."));
  const testDir = join(projectDir, "src", "test", "java", ...packageName.split("."));
  copyKotlinFiles(runtimeDir, mainDir);
  copyKotlinFiles(runtimeTestsDir, testDir);

  const exitCode = runGradleTests(projectDir);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
} finally {
  rmSync(projectDir, { recursive: true, force: true });
}
