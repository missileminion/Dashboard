# Galaxy Watch app

Full-screen cards, swiped sideways: **Run, Legs, Push, Pull**. It opens on today's card (Wednesday, the run day, opens on Run).

- A day card scrolls down (bezel or finger) into its exercises. Tap one: turn the bezel to set the weight (a tick per marker:
  whole numbers firm, quarters light), **tap the number to log the set**. Tap reps or sets to move them with the bezel instead.
  Hold the number to change the step (.25 / 1 / 5). "N sets today" on the card opens today's sets (undo takes two taps).
- The Run card starts a run tracked by the watch's Health Services: time, heart rate and zone, distance, pace, calories, GPS.
  Scroll down for Pause and End run. Closing the app does not stop the run; reopening it picks it back up.

## Build

    sh wear/build.sh

## Install on the watch (once)

1. Watch on the same Wi-Fi as the Mac, with Wi-Fi set to **On** (not Auto: a Galaxy Watch drops Wi-Fi while it is on Bluetooth to the phone).
2. Settings → About watch → Software information → tap "Software version" 5 times (developer options on).
3. Settings → Developer options → turn on ADB debugging and Wireless debugging. Tap Wireless debugging → "Pair new device" and keep that screen open.
4. In **Terminal** (it must be Terminal: macOS's Local Network privacy blocks the adb background program when another app started it):

       ~/.dashboard-toolchain/sdk/platform-tools/adb kill-server
       ~/.dashboard-toolchain/sdk/platform-tools/adb pair 192.168.1.43:PORT      # the address on the pairing screen, then its 6-digit code

   The watch then connects by itself; `adb devices` lists it as `adb-…._adb-tls-connect._tcp`.

## Update the app

    ~/.dashboard-toolchain/sdk/platform-tools/adb devices
    ~/.dashboard-toolchain/sdk/platform-tools/adb -s <the adb-… name> install -r DashboardWatch.apk

If the watch is not listed, turn Wireless debugging back on (it switches off when the watch changes network or restarts).

## How it talks to the phone

Wear OS Data Layer (Google Play services), over Bluetooth, or Wi-Fi when out of Bluetooth range. Both apps must have the same
application id and be signed with the same key; both are debug builds from this Mac, so they are.

- Watch → phone: each set is a data item `/gym/add/<id>` (undo: `/gym/del/<id>`). Play services queues it until the two are connected.
  The phone app's background listener (android/native/WearSync.kt) stores it, and the page adds it to the gym log and syncs it to GitHub the next time the app runs.
- Phone → watch: the page publishes `/gym/state` (program, unit, step, the latest set of each exercise, today's sets) after every change.
