package io.github.missileminion.dashboard

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

// A run, tracked by the watch's Health Services (the same engine Samsung Health and Google's apps use): heart rate, distance,
// pace, calories, GPS. Health Services keeps the run going in its own process if this app is closed; reopening the app picks it up.
object Run {
    enum class S { IDLE, STARTING, ACTIVE, PAUSED, ENDED }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var app: Context

    var state by mutableStateOf(S.IDLE); private set
    var hr by mutableStateOf<Double?>(null); private set            // bpm, latest
    var hrMax by mutableStateOf(0.0); private set
    private var hrSum = 0.0; private var hrN = 0
    val hrAvg get() = if (hrN > 0) hrSum / hrN else null
    var distanceM by mutableStateOf(0.0); private set
    var calories by mutableStateOf(0.0); private set
    var speed by mutableStateOf<Double?>(null); private set         // m/s, latest
    var error by mutableStateOf<String?>(null)
    private var checkpoint: Pair<Duration, Instant>? = null
    private var tileAt = 0L
    // what is kept for the run log (sent to the phone when the run ends): GPS route, heart rate every 5 s, start time
    private var startedAt = 0L
    private val route = ArrayList<DoubleArray>()
    private val hrSamples = ArrayList<IntArray>()
    // pace coach: a smoothed pace compared with the target from the phone; a buzz pattern when off it (rate-limited)
    private var ema: Double? = null; private var cueAt = 0L
    var cue by mutableStateOf(""); private set   // "speed up", "ease off", "on pace" or ""

    fun activeSeconds(now: Instant = Instant.now()): Long {
        val (d, at) = checkpoint ?: return 0
        return (if (state == S.ACTIVE) d + Duration.between(at, now) else d).seconds.coerceAtLeast(0)
    }
    /** min:sec per km from the current speed, or null when standing still */
    fun paceSecPerKm(): Long? = speed?.takeIf { it > 0.3 }?.let { (1000 / it).toLong() }
    // heart rate zones as % of an estimated max (220 − age is not known here, so 190 bpm; the phone can send the real one later)
    fun zone(bpm: Double?, max: Double = 190.0): Int = when { bpm == null -> 0; bpm < .6 * max -> 1; bpm < .7 * max -> 2; bpm < .8 * max -> 3; bpm < .9 * max -> 4; else -> 5 }

    private val client get() = HealthServices.getClient(app).exerciseClient
    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val m = update.latestMetrics
            m.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value?.let { v -> if (v > 0) { hr = v; hrSum += v; hrN++; if (v > hrMax) hrMax = v } }
            m.getData(DataType.DISTANCE_TOTAL)?.total?.let { distanceM = it }
            m.getData(DataType.CALORIES_TOTAL)?.total?.let { calories = it }
            m.getData(DataType.SPEED).lastOrNull()?.value?.let { speed = it }
            update.activeDurationCheckpoint?.let { checkpoint = it.activeDuration to it.time }
            val sec = activeSeconds().toInt()
            m.getData(DataType.LOCATION).forEach { p ->   // the route: a point when we have moved about 8 m
                val la = p.value.latitude; val lo = p.value.longitude; val l = route.lastOrNull()
                if (l == null || Math.hypot((la - l[0]) * 111_000, (lo - l[1]) * 111_000 * Math.cos(Math.toRadians(la))) > 8) route.add(doubleArrayOf(la, lo))
            }
            hr?.let { b -> if (hrSamples.isEmpty() || sec - hrSamples.last()[0] >= 5) hrSamples.add(intArrayOf(sec, b.toInt())) }
            coach(sec)
            val st = update.exerciseStateInfo.state
            val was = state
            state = when { st.isEnded -> S.ENDED; st.isPaused -> S.PAUSED; else -> S.ACTIVE }
            val t = System.currentTimeMillis()
            if (state != was || t - tileAt > 30_000) { tileAt = t; Tiles.refresh(app) }   // the Run tile shows live pace: redraw it at most every 30 s
        }
        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) { error = throwable.message }
        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    }

    fun init(ctx: Context) {
        if (::app.isInitialized) return; app = ctx.applicationContext
        scope.launch {   // a run already in progress (app was closed): listen to it again
            runCatching { if (client.getCurrentExerciseInfoAsync().await().exerciseTrackedStatus == androidx.health.services.client.data.ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS) { client.setUpdateCallback(callback); state = S.ACTIVE } }
        }
    }

    fun start() {
        if (state == S.STARTING || state == S.ACTIVE || state == S.PAUSED) return
        startedAt = System.currentTimeMillis(); route.clear(); hrSamples.clear(); ema = null; cueAt = 0; cue = ""
        state = S.STARTING; error = null; hr = null; hrMax = 0.0; hrSum = 0.0; hrN = 0; distanceM = 0.0; calories = 0.0; speed = null; checkpoint = Duration.ZERO to Instant.now()
        scope.launch {
            try {
                val caps = client.getCapabilitiesAsync().await().getExerciseTypeCapabilities(ExerciseType.RUNNING)
                val want = setOf(DataType.HEART_RATE_BPM, DataType.DISTANCE_TOTAL, DataType.CALORIES_TOTAL, DataType.SPEED, DataType.LOCATION)
                val types = want.filter { it in caps.supportedDataTypes }.toSet()
                client.setUpdateCallback(callback)
                client.startExerciseAsync(ExerciseConfig.builder(ExerciseType.RUNNING).setDataTypes(types).setIsGpsEnabled(true).build()).await()
                state = S.ACTIVE; Tiles.refresh(app)
            } catch (e: Exception) { state = S.IDLE; error = if (e is SecurityException || e.message?.contains("permission", true) == true) "Allow heart rate and location to start a run" else "Could not start the run" }
        }
    }
    fun pause() = scope.launch { runCatching { client.pauseExerciseAsync().await() } }
    fun resume() = scope.launch { runCatching { client.resumeExerciseAsync().await() } }
    fun end() = scope.launch {
        val sec = activeSeconds(); val km = distanceM / 1000   // read before ending: an ended exercise reports no active time
        runCatching { client.endExerciseAsync().await() }; state = S.ENDED; cue = ""
        Store.saveRun(km, sec)
        if (sec >= 60) Store.sendRun(runJson(sec))   // to the phone, which adds it to the run log on GitHub
    }

    // the run in the dashboard's workout shape, plus the watch's own heart-rate trace and route
    private fun runJson(sec: Long): String {
        val r = if (route.size > 2500) route.filterIndexed { i, _ -> i % ((route.size + 2499) / 2500) == 0 } else route
        val end = System.currentTimeMillis(); val offset = java.util.TimeZone.getDefault().getOffset(startedAt) / 1000
        return org.json.JSONObject().put("id", startedAt).put("source", "watch").put("type", "RUNNING").put("start", startedAt).put("end", end).put("offset", offset)
            .put("seconds", sec).put("distanceM", Math.round(distanceM)).put("paceSecPerKm", if (distanceM > 50) Math.round(sec / (distanceM / 1000)) else org.json.JSONObject.NULL)
            .put("avgHr", hrAvg?.let { Math.round(it) } ?: org.json.JSONObject.NULL).put("maxHr", if (hrMax > 0) Math.round(hrMax) else org.json.JSONObject.NULL).put("kcal", Math.round(calories))
            .put("paceTarget", if (Store.paceTarget > 0) Store.paceTarget else org.json.JSONObject.NULL)
            .put("hr", org.json.JSONArray(hrSamples.map { org.json.JSONArray(listOf(it[0], it[1])) }))
            .put("route", org.json.JSONArray(r.map { org.json.JSONArray(listOf(Math.round(it[0] * 1e5) / 1e5, Math.round(it[1] * 1e5) / 1e5)) })).toString()
    }

    // pace coach. Every update: smooth the pace; after the first 45 s, if it is more than 12 s/km off the target, buzz
    // (three quick taps = speed up, one long soft buzz = ease off), at most every 25 s. Back on pace: one short tap, once.
    private fun coach(sec: Int) {
        val target = Store.paceTarget; if (target <= 0 || state != S.ACTIVE) { cue = ""; return }
        val p = paceSecPerKm()?.toDouble() ?: return
        ema = ema?.let { .25 * p + .75 * it } ?: p
        if (sec < 45) return
        val e = ema!!; val now = System.currentTimeMillis()
        val next = when { e > target + 12 -> "speed up"; e < target - 12 -> "ease off"; else -> "on pace" }
        if (next != cue || (next != "on pace" && now - cueAt > 25_000)) {
            if (next != "on pace" || cue != "") buzz(next); cueAt = now; cue = next
        }
    }
    private fun buzz(kind: String) = runCatching {
        val v = if (android.os.Build.VERSION.SDK_INT >= 31) app.getSystemService(android.os.VibratorManager::class.java).defaultVibrator else @Suppress("DEPRECATION") app.getSystemService(android.os.Vibrator::class.java)
        val e = when (kind) {
            "speed up" -> android.os.VibrationEffect.createWaveform(longArrayOf(0, 90, 90, 90, 90, 90), intArrayOf(0, 255, 0, 255, 0, 255), -1)
            "ease off" -> android.os.VibrationEffect.createWaveform(longArrayOf(0, 120, 380), intArrayOf(0, 200, 90), -1)
            else -> android.os.VibrationEffect.createOneShot(60, 160)
        }
        v.vibrate(e)
    }
    fun reset() { if (state == S.ENDED) state = S.IDLE }
}
