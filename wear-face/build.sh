#!/bin/sh
# Builds the CORE · INSTRUMENT watch face:  sh wear-face/build.sh   → wear-face/app/build/outputs/apk/debug/app-debug.apk
set -e
cd "$(dirname "$0")"
T="$HOME/.dashboard-toolchain"
if [ -d "$T/jdk" ]; then export JAVA_HOME="$T/jdk/Contents/Home" PATH="$T/jdk/Contents/Home/bin:$T/node/bin:$PATH" ANDROID_HOME="$T/sdk" GRADLE_USER_HOME="$T/gradle"; fi
node tools/gen.mjs
[ -f local.properties ] || echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew -q assembleDebug
echo "Built: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
