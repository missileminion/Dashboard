# Dashboard for Android

The Android app is the web app in `../app`, wrapped with Capacitor. It opens the phone layout (`app/lite.html`) and adds one
native piece: **Health Connect**, so the band's data is read on the phone with no Google sign-in and no daily tap.

## How the phone and the web version stay in sync

```
Fitbit band → Fitbit app → Health Connect ──(read on open / on return)──► Android app
                                                                             │  same day rows as the Google Health API sync
                                                                             ▼
                                              your private GitHub data repo: health-cache.b64, gym-log.json
                                                                             ▲
                                                 web version (GitHub Pages) ─┘  pulls the newer copy when it loads
```

* The app reads Health Connect every time you open it or come back to it (at most every 5 minutes). Nothing to tap.
* After a read it uploads the health cache to your GitHub data repo (the same `health-cache.b64` the web version already uses).
  The web version takes it on its next load; its header chip says **Phone 07:12** when the numbers came from the phone.
* The gym log syncs both ways through `gym-log.json`, exactly as before.
* For the upload, the app needs your GitHub data repo + token once: open **Full dashboard → Gym log → GitHub sync** inside the app.
* The web version can still sign in to the Google Health API itself. Whichever device synced last wins (the existing rule).

## One-time install (about 20 minutes, mostly downloads)

1. **Node 20+**: download the macOS installer from https://nodejs.org (LTS) and run it.
2. **Android Studio**: download from https://developer.android.com/studio, open it once and let it install the SDK.
   (It includes the Java 21 the build needs; `setup.sh` uses it automatically.)
3. On the S24: Settings → About phone → Software information → tap *Build number* 7 times, then Developer options → **USB debugging** on.
4. Build:

```bash
sh ~/Desktop/"Claude Code Personal Dashboard"/android/setup.sh
```

5. Plug in the phone and install (the script prints this line with the full path):

```bash
~/Library/Android/sdk/platform-tools/adb install -r ~/Desktop/"Claude Code Personal Dashboard"/android/android/app/build/outputs/apk/debug/app-debug.apk
```

6. Open **Dashboard** on the phone and tap **Connect** (top right). Allow everything on Health Connect's sheet, including
   *Access past data* so the first read can go back 200 days.

After changing anything in `app/`, rebuild with `cd android && npm run apk` and install again.

## Checking the band-only rule

Only records written by the Fitbit app (`com.fitbit.FitbitMobile`) are used. Samsung Health, Strava and others are ignored.
To check which app actually writes the band's data on your phone: Body tab → **Health Connect sources**. If the band's data comes
from a different package, set it once in the WebView console (`chrome://inspect` on the Mac):
`localStorage.setItem("hc.origins", JSON.stringify(["the.package.name"]))`.

## Things to verify on the real phone (not testable on the Mac tonight)

* **Fitbit → Health Connect coverage.** Sleep stages, resting HR, heart rate and exercise are normally written. HRV, SpO2,
  breathing rate, skin temperature and VO2 max depend on the Fitbit app version. Missing types simply show "—" and red never appears for them.
* **Active zone minutes** are not in Health Connect, so they are worked out from heart rate per minute (heart-rate reserve:
  fat burn 40–59 %, cardio 60–84 %, peak 85 %+; resting HR = median of recent days; max = 220 − age from the macro profile).
  Compare a week against the Fitbit app; thresholds live in `native/HealthConnectPlugin.kt` (`activeZoneMinutes`).
* `server.appStartPath` (Capacitor 7) opens `lite.html` first; `index.html` also redirects there inside the app as a fallback.
* Library versions in `patch.mjs` (`connect-client:1.1.0`, Kotlin 2.0.21) were current when written. If Gradle complains, bump them.

## Files

| File | What it is |
| --- | --- |
| `capacitor.config.json` | app id `io.github.missileminion.dashboard`, web folder `../app`, dark background |
| `native/HealthConnectPlugin.kt` | reads Health Connect, returns plain records; works out zone minutes |
| `native/MainActivity.java` | registers the plugin; Back = close popover → Today → exit |
| `native/PrivacyActivity.kt` | the "how your data is used" screen Health Connect requires |
| `patch.mjs` | wires the above into the generated project (permissions, Kotlin, min SDK 26) |
| `setup.sh` | install → generate → patch → build |
| `../app/js/hc.js` | turns records into the dashboard's day rows, saves them, uploads the cache |

`android/android/` (generated) and `node_modules/` are git-ignored; `setup.sh` recreates them. No secrets live here: the
GitHub token stays in the app's own storage on the phone, typed in by you.
