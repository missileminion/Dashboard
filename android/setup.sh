#!/bin/sh
# One command from nothing to an installable APK:  sh android/setup.sh
# Needs Node 20+, JDK 21 and the Android SDK (Android Studio). See android/README.md.
set -e
cd "$(dirname "$0")"
JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # Android Studio ships a JDK 21: use it, so no separate Java install is needed
[ -d "$JBR" ] && export JAVA_HOME="$JBR" && export PATH="$JBR/bin:$PATH"
command -v node >/dev/null || { echo "Node is missing. Install it first (see android/README.md)."; exit 1; }
java -version 2>&1 | grep -Eq 'version "(2[1-9]|[3-9][0-9])' || { echo "JDK 21+ is needed (java -version shows an older one). See android/README.md."; exit 1; }
[ -n "$ANDROID_HOME" ] || [ -d "$HOME/Library/Android/sdk" ] || { echo "Android SDK not found. Install Android Studio and open it once."; exit 1; }
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
npm install
[ -d android ] || npx cap add android
node patch.mjs
npx cap sync android
(cd android && ./gradlew assembleDebug)
APK="$(pwd)/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Built: $APK"
echo "Install on the phone (USB debugging on):  $ANDROID_HOME/platform-tools/adb install -r \"$APK\""
