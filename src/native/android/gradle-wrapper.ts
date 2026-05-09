import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gradleWrapperPropertiesTemplate } from "./gradle-wrapper-properties.ts";

export const GRADLE_VERSION = "8.11.1";

const gradleWrapperJarAssetPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "assets",
  `gradle-wrapper-${GRADLE_VERSION}.jar`,
);
const gradleWrapperJarSha256 = "2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046";

function gradlewTemplate(): string {
  return `#!/bin/sh

APP_HOME=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -n "$JAVA_HOME" ]; then
  JAVACMD="$JAVA_HOME/bin/java"
else
  JAVACMD=java
fi

if ! command -v "$JAVACMD" >/dev/null 2>&1; then
  echo "ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH." >&2
  echo "Install a JDK or set JAVA_HOME to the JDK used by Android Studio." >&2
  exit 1
fi

exec "$JAVACMD" \\
  -Dorg.gradle.appname=gradlew \\
  -classpath "$APP_HOME/gradle/wrapper/gradle-wrapper.jar" \\
  org.gradle.wrapper.GradleWrapperMain \\
  "$@"
`;
}

function gradlewBatTemplate(): string {
  return `@echo off
set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
set APP_HOME=%DIRNAME%

if defined JAVA_HOME (
  set JAVA_EXE=%JAVA_HOME%\\bin\\java.exe
) else (
  set JAVA_EXE=java.exe
)

"%JAVA_EXE%" -version >NUL 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH. 1>&2
  echo Install a JDK or set JAVA_HOME to the JDK used by Android Studio. 1>&2
  exit /b 1
)

"%JAVA_EXE%" -Dorg.gradle.appname=gradlew -classpath "%APP_HOME%\\gradle\\wrapper\\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
`;
}

function readGradleWrapperJar(): Uint8Array {
  const bytes = readFileSync(gradleWrapperJarAssetPath);
  const digest = createHash("sha256").update(bytes).digest("hex");

  if (digest !== gradleWrapperJarSha256) {
    throw new Error(
      `Packaged Gradle wrapper ${GRADLE_VERSION} failed SHA-256 verification. Expected ${gradleWrapperJarSha256}, received ${digest}.`,
    );
  }

  return bytes;
}

export function writeGradleWrapper(projectRoot: string): void {
  const gradlewPath = join(projectRoot, "gradlew");
  const gradlewBatPath = join(projectRoot, "gradlew.bat");
  const gradleWrapperDir = join(projectRoot, "gradle", "wrapper");

  mkdirSync(gradleWrapperDir, { recursive: true });
  writeFileSync(gradlewPath, gradlewTemplate());
  chmodSync(gradlewPath, 0o755);
  writeFileSync(gradlewBatPath, gradlewBatTemplate());
  writeFileSync(
    join(gradleWrapperDir, "gradle-wrapper.properties"),
    gradleWrapperPropertiesTemplate(),
  );
  writeFileSync(join(gradleWrapperDir, "gradle-wrapper.jar"), readGradleWrapperJar());
}
