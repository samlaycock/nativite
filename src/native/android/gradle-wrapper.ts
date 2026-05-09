import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { gradleWrapperPropertiesTemplate } from "./gradle-wrapper-properties.ts";

export const GRADLE_VERSION = "8.11.1";

const gradleWrapperJarUrl = `https://raw.githubusercontent.com/gradle/gradle/v${GRADLE_VERSION}/gradle/wrapper/gradle-wrapper.jar`;

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

async function downloadGradleWrapperJar(): Promise<Uint8Array> {
  let response: Response;

  try {
    response = await fetch(gradleWrapperJarUrl);
  } catch (error) {
    throw new Error(
      `Failed to download Gradle wrapper ${GRADLE_VERSION} from ${gradleWrapperJarUrl}. Check your network connection and try again.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to download Gradle wrapper ${GRADLE_VERSION} from ${gradleWrapperJarUrl}: ${response.status} ${response.statusText}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function writeGradleWrapper(projectRoot: string): Promise<void> {
  const gradlewPath = join(projectRoot, "gradlew");
  const gradlewBatPath = join(projectRoot, "gradlew.bat");
  const gradleWrapperDir = join(projectRoot, "gradle", "wrapper");

  writeFileSync(gradlewPath, gradlewTemplate());
  chmodSync(gradlewPath, 0o755);
  writeFileSync(gradlewBatPath, gradlewBatTemplate());
  writeFileSync(
    join(gradleWrapperDir, "gradle-wrapper.properties"),
    gradleWrapperPropertiesTemplate(),
  );
  writeFileSync(join(gradleWrapperDir, "gradle-wrapper.jar"), await downloadGradleWrapperJar());
}
