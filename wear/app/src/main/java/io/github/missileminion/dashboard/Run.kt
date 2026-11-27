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
    private var checkpoint: Pair<Duration, Instant>? = null          // active time at a moment; time since then is added while running

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
            val st = update.exerciseStateInfo.state
            state = when { st.isEnded -> S.ENDED; st.isPaused -> S.PAUSED; else -> S.ACTIVE }
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
        state = S.STARTING; error = null; hr = null; hrMax = 0.0; hrSum = 0.0; hrN = 0; distanceM = 0.0; calories = 0.0; speed = null; checkpoint = Duration.ZERO to Instant.now()
        scope.launch {
            try {
                val caps = client.getCapabilitiesAsync().await().getExerciseTypeCapabilities(ExerciseType.RUNNING)
                val want = setOf(DataType.HEART_RATE_BPM, DataType.DISTANCE_TOTAL, DataType.CALORIES_TOTAL, DataType.SPEED)
                val types = want.filter { it in caps.supportedDataTypes }.toSet()
                client.setUpdateCallback(callback)
                client.startExerciseAsync(ExerciseConfig.builder(ExerciseType.RUNNING).setDataTypes(types).setIsGpsEnabled(true).build()).await()
                state = S.ACTIVE
            } catch (e: Exception) { state = S.IDLE; error = if (e is SecurityException || e.message?.contains("permission", true) == true) "Allow heart rate and location to start a run" else "Could not start the run" }
        }
    }
    fun pause() = scope.launch { runCatching { client.pauseExerciseAsync().await() } }
    fun resume() = scope.launch { runCatching { client.resumeExerciseAsync().await() } }
    fun end() = scope.launch { runCatching { client.endExerciseAsync().await() }; state = S.ENDED }
    fun reset() { if (state == S.ENDED) state = S.IDLE }
}
