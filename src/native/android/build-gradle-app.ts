import type { NativiteConfig } from "../../index.ts";

export function buildGradleAppTemplate(
  config: NativiteConfig,
  minSdk: number,
  targetSdk: number,
): string {
  return `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val nativiteWebBundleDir = rootProject.layout.projectDirectory.dir("../../dist-android")
val nativiteGeneratedAssetsDir = layout.buildDirectory.dir("generated/nativite/assets")
val nativiteDevMetadataFile = layout.projectDirectory.file("src/main/assets/dev.json")

val copyNativiteWebBundle by tasks.registering(Copy::class) {
    val bundlePath = nativiteWebBundleDir.asFile

    doFirst {
        if (!bundlePath.isDirectory) {
            throw GradleException("Missing Android web bundle at \${bundlePath.path}. Run \`bunx nativite build --platform android\` before building release.")
        }
    }

    from(nativiteWebBundleDir)
    into(nativiteGeneratedAssetsDir.map { it.dir("dist") })
}

val deleteNativiteDevMetadata by tasks.registering(Delete::class) {
    delete(nativiteDevMetadataFile)
}

android {
    namespace = "${config.app.bundleId}"
    compileSdk = ${targetSdk}

    defaultConfig {
        applicationId = "${config.app.bundleId}"
        minSdk = ${minSdk}
        targetSdk = ${targetSdk}
        versionCode = ${config.app.buildNumber}
        versionName = "${config.app.version}"
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            assets.srcDirs("src/main/assets")
            assets.srcDir(nativiteGeneratedAssetsDir)
        }
    }
}

tasks.configureEach {
    if (name == "mergeReleaseAssets") {
        dependsOn(copyNativiteWebBundle)
        dependsOn(deleteNativiteDevMetadata)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.core.splashscreen)
}
`;
}
