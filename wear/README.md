# Galaxy Watch app (gym log)

The gym log on the watch: turn the bezel to set the weight, tap reps or sets to move them with the bezel instead, tap LOG.
Tap the exercise name to pick another; tap the line under it for today's sets (undo takes two taps). Hold the weight to change the step (.25 / 1 / 5).

## Build

    sh wear/build.sh

## Install on the watch (once)

1. On the watch: Settings → About watch → Software → tap "Software version" 5 times (developer options on).
2. Settings → Developer options → turn on ADB debugging and Wireless debugging. Tap Wireless debugging → "Pair new device" and note the IP, port and code.
3. On the Mac (same Wi-Fi):

       ~/.dashboard-toolchain/sdk/platform-tools/adb pair IP:PAIR_PORT CODE
       ~/.dashboard-toolchain/sdk/platform-tools/adb connect IP:PORT
       ~/.dashboard-toolchain/sdk/platform-tools/adb -s IP:PORT install -r wear/app/build/outputs/apk/debug/app-debug.apk

## How it talks to the phone

Wear OS Data Layer (Google Play services), over Bluetooth, or Wi-Fi when out of Bluetooth range. Both apps must have the same
application id and be signed with the same key; both are debug builds from this Mac, so they are.

- Watch → phone: each set is a data item `/gym/add/<id>` (undo: `/gym/del/<id>`). Play services queues it until the two are connected.
  The phone app's background listener (android/native/WearSync.kt) stores it, and the page adds it to the gym log and syncs it to GitHub the next time the app runs.
- Phone → watch: the page publishes `/gym/state` (program, unit, step, the latest set of each exercise, today's sets) after every change.
