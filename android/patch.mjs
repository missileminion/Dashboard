// Adds Health Connect to the Android project that `npx cap add android` generates (android/android/).
// Safe to run again: every change checks first. Run by setup.sh; you never need to edit the generated project by hand.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), A = path.join(here, "android");
const PKG = "io.github.missileminion.dashboard", SRC = path.join(A, "app/src/main/java", ...PKG.split("."));
const read = p => fs.readFileSync(path.join(A, p), "utf8"), write = (p, s) => fs.writeFileSync(path.join(A, p), s);
const edit = (p, fn) => { const s = read(p), t = fn(s); if (t !== s) { write(p, t); console.log("patched", p); } };
if (!fs.existsSync(A)) { console.error("android/android is missing: run `npx cap add android` first (setup.sh does this)."); process.exit(1); }

// 1. our native code
fs.mkdirSync(SRC, { recursive: true });
for (const f of ["HealthConnectPlugin.kt", "PrivacyActivity.kt", "MainActivity.java", "WearSync.kt", "Haptics.kt"]) fs.copyFileSync(path.join(here, "native", f), path.join(SRC, f));
console.log("copied native sources");
// the app icon (drawn by icon.mjs): copied over the default Capacitor icon
fs.cpSync(path.join(here, "native/res"), path.join(A, "app/src/main/res"), { recursive: true });
console.log("copied the app icon");

// 2. Kotlin (the Health Connect library is Kotlin-first)
edit("build.gradle", s => s.includes("kotlin-gradle-plugin") ? s : s.replace(/(buildscript\s*\{[\s\S]*?dependencies\s*\{)/, `$1\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21'`));
edit("app/build.gradle", s => {
  if (!s.includes("kotlin-android")) s = s.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'");
  if (!s.includes("connect-client")) s = s.replace(/dependencies\s*\{/, `dependencies {\n    implementation "androidx.health.connect:connect-client:1.1.0"\n    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1"`);
  if (!s.includes("play-services-wearable")) s = s.replace(/dependencies\s*\{/, `dependencies {\n    implementation "com.google.android.gms:play-services-wearable:19.0.0"`);   // the Galaxy Watch link
  return s;
});
edit("gradle.properties", s => s.includes("kotlin.jvm.target.validation.mode") ? s : s + "\nkotlin.jvm.target.validation.mode=warning\n");
// 3. Health Connect needs Android 8 (API 26) or newer
edit("variables.gradle", s => s.replace(/minSdkVersion\s*=\s*\d+/, m => (+m.match(/\d+/)[0] < 26 ? "minSdkVersion = 26" : m)));
// connect-client 1.1.0 must be compiled against API 36 with Android Gradle plugin 8.9.1+ (the app still targets API 35)
edit("variables.gradle", s => s.replace(/compileSdkVersion\s*=\s*\d+/, m => (+m.match(/\d+/)[0] < 36 ? "compileSdkVersion = 36" : m)));
edit("build.gradle", s => s.replace(/com\.android\.tools\.build:gradle:(\d+)\.(\d+)\.(\d+)/, (m, a, b) => (+a < 8 || (+a === 8 && +b < 9) ? "com.android.tools.build:gradle:8.9.1" : m)));

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
// 4b. the haptic language plays shaped vibrations (Haptics.kt), which needs the ordinary vibrate permission
edit("app/src/main/AndroidManifest.xml", s => s.includes("android.permission.VIBRATE") ? s : s.replace(/<application/, `<uses-permission android:name="android.permission.VIBRATE" />\n\n    <application`));
// 5. the Galaxy Watch link: a background listener for sets logged on the watch (WearSync.kt)
edit("app/src/main/AndroidManifest.xml", s => s.includes(".WearListener") ? (s.includes('pathPrefix="/run/"') ? s : s.replace('android:pathPrefix="/gym/" />', 'android:pathPrefix="/gym/" />\n                <data android:scheme="wear" android:host="*" android:pathPrefix="/run/" />')) : s.replace(/<\/application>/, `    <service android:name=".WearListener" android:exported="true">
            <intent-filter>
                <action android:name="com.google.android.gms.wearable.DATA_CHANGED" />
                <data android:scheme="wear" android:host="*" android:pathPrefix="/gym/" />
                <data android:scheme="wear" android:host="*" android:pathPrefix="/run/" />
            </intent-filter>
        </service>
    </application>`));
console.log("Health Connect is wired in.");
