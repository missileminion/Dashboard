// Adds Health Connect to the Android project that `npx cap add android` generates (android/android/).
// Safe to run again: every change checks first. Run by setup.sh; you never need to edit the generated project by hand.
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname), A = path.join(here, "android");
const PKG = "io.github.missileminion.dashboard", SRC = path.join(A, "app/src/main/java", ...PKG.split("."));
const read = p => fs.readFileSync(path.join(A, p), "utf8"), write = (p, s) => fs.writeFileSync(path.join(A, p), s);
const edit = (p, fn) => { const s = read(p), t = fn(s); if (t !== s) { write(p, t); console.log("patched", p); } };
if (!fs.existsSync(A)) { console.error("android/android is missing: run `npx cap add android` first (setup.sh does this)."); process.exit(1); }

// 1. our native code
fs.mkdirSync(SRC, { recursive: true });
for (const f of ["HealthConnectPlugin.kt", "PrivacyActivity.kt", "MainActivity.java"]) fs.copyFileSync(path.join(here, "native", f), path.join(SRC, f));
console.log("copied native sources");

// 2. Kotlin (the Health Connect library is Kotlin-first)
edit("build.gradle", s => s.includes("kotlin-gradle-plugin") ? s : s.replace(/(buildscript\s*\{[\s\S]*?dependencies\s*\{)/, `$1\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21'`));
edit("app/build.gradle", s => {
  if (!s.includes("kotlin-android")) s = s.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'");
  if (!s.includes("connect-client")) s = s.replace(/dependencies\s*\{/, `dependencies {\n    implementation "androidx.health.connect:connect-client:1.1.0"\n    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1"`);
  return s;
});
edit("gradle.properties", s => s.includes("kotlin.jvm.target.validation.mode") ? s : s + "\nkotlin.jvm.target.validation.mode=warning\n");
// 3. Health Connect needs Android 8 (API 26) or newer
edit("variables.gradle", s => s.replace(/minSdkVersion\s*=\s*\d+/, m => (+m.match(/\d+/)[0] < 26 ? "minSdkVersion = 26" : m)));

// 4. manifest: read permissions, the Health Connect package query, and the privacy screen Health Connect links to
const PERMS = ["SLEEP", "RESTING_HEART_RATE", "HEART_RATE_VARIABILITY", "OXYGEN_SATURATION", "RESPIRATORY_RATE", "VO2_MAX", "EXERCISE", "HEART_RATE", "DISTANCE", "SKIN_TEMPERATURE", "HEALTH_DATA_HISTORY"];
edit("app/src/main/AndroidManifest.xml", s => {
  if (s.includes("android.permission.health.")) return s;
  const perms = PERMS.map(p => `    <uses-permission android:name="android.permission.health.READ_${p}" />`).join("\n");
  s = s.replace(/<application/, `${perms}\n    <queries><package android:name="com.google.android.apps.healthdata" /></queries>\n\n    <application`);
  s = s.replace(/<\/application>/, `
        <activity android:name=".PrivacyActivity" android:exported="true" android:theme="@style/AppTheme.NoActionBar">
            <intent-filter><action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" /></intent-filter>
        </activity>
        <activity-alias android:name="ViewPermissionUsageActivity" android:exported="true" android:targetActivity=".PrivacyActivity" android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter><action android:name="android.intent.action.VIEW_PERMISSION_USAGE" /><category android:name="android.intent.category.HEALTH_PERMISSIONS" /></intent-filter>
        </activity-alias>
    </application>`);
  // keyboard pushes the page up instead of covering inputs; portrait only, like the web manifest
  s = s.replace(/(<activity[^>]*\.MainActivity"[^>]*?)(android:windowSoftInputMode="[^"]*")?/, (m, a) => (m.includes("windowSoftInputMode") ? m : a + ' android:windowSoftInputMode="adjustResize" android:screenOrientation="portrait"'));
  return s;
});
console.log("Health Connect is wired in.");
