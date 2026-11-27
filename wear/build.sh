#!/bin/sh
# Builds the Galaxy Watch app:  sh wear/build.sh   → wear/app/build/outputs/apk/debug/app-debug.apk
# Same toolchain as the phone app (android/setup.sh). Signed with the same debug key, which the watch↔phone link needs.
set -e
cd "$(dirname "$0")"
T="$HOME/.dashboard-toolchain"
if [ -d "$T/jdk" ]; then export JAVA_HOME="$T/jdk/Contents/Home" PATH="$T/jdk/Contents/Home/bin:$PATH" ANDROID_HOME="$T/sdk" GRADLE_USER_HOME="$T/gradle"; fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ -f local.properties ] || echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug
echo "Built: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
