package io.github.missileminion.dashboard

// Health Connect for the Dashboard app. The web page calls these through Capacitor (app/js/hc.js):
//   status()  -> {available, sdk, all, granted[]}
//   request() -> opens Health Connect's permission sheet, resolves with what was granted
//   install() -> Play Store page for Health Connect (only needed on Android 13 and older)
//   read({type, start, end, origins[]}) -> {records: [...]}  plain numbers only (epoch ms, offsets in seconds)
//   activeZoneMinutes({start, end, rest, max, origins[]}) -> {days: [{date, fat, cardio, peak}]}
//   origins({start, end}) -> {origins: {packageName: count}}   which apps wrote data, to check the band-only rule
// Read-only: this app never writes to Health Connect. Nothing leaves the phone from here; the page decides what to share.

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.HapticFeedbackConstants as H
import android.view.WindowManager
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.reflect.KClass

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    // Any failure inside a read is logged and reported to the page; it must never take the app down.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineExceptionHandler { _, e -> android.util.Log.e("HealthConnect", "uncaught", e) })
    // Timestamps from the page (Date.now()) arrive as Long, which PluginCall.getDouble() does not accept, so read any JSON number here.
    private fun num(call: PluginCall, name: String): Double? = (call.data.opt(name) as? Number)?.toDouble()
    private var launcher: ActivityResultLauncher<Set<String>>? = null
    private var pending: PluginCall? = null
    private val client by lazy { HealthConnectClient.getOrCreate(context) }

    private val types: Map<String, KClass<out Record>> = mapOf(
        "sleep" to SleepSessionRecord::class,
        "restingHr" to RestingHeartRateRecord::class,
        "hrv" to HeartRateVariabilityRmssdRecord::class,
        "spo2" to OxygenSaturationRecord::class,
        "resp" to RespiratoryRateRecord::class,
        "vo2" to Vo2MaxRecord::class,
        "exercise" to ExerciseSessionRecord::class,
        "heartRate" to HeartRateRecord::class,
        "distance" to DistanceRecord::class,
        "skinTemp" to SkinTemperatureRecord::class,
    )
    // READ_HEALTH_DATA_HISTORY lets the first read go back further than 30 days before permission was granted.
    private val perms: Set<String> get() = types.values.map { HealthPermission.getReadPermission(it) }.toSet() + HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY

    override fun load() {
        // Registered while the activity is being created, which is when Capacitor loads plugins.
        launcher = try { activity.registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            pending?.resolve(JSObject().put("granted", JSArray(granted.toList())).put("all", granted.containsAll(perms)))
            pending = null
        } } catch (e: Exception) { android.util.Log.e("HealthConnect", "permission launcher", e); null }
    }

    // Not Health Connect, but this is the app's one plugin: keep the screen on while the rep metronome runs (web audio stops in the background).
    @PluginMethod
    fun keepScreenOn(call: PluginCall) {
        val on = call.getBoolean("on") ?: false
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            call.resolve()
        }
    }

    // UI haptics through the system's own patterns (they follow the phone's touch-feedback setting; no vibrate permission needed).
    // minor/major: detents on a scale (Android 14's segment ticks, made for sliders); tap: a button; toggle; confirm; reject.
    @PluginMethod
    fun haptic(call: PluginCall) {
        val k = call.getString("kind") ?: "tap"
        val u = Build.VERSION.SDK_INT >= 34; val r = Build.VERSION.SDK_INT >= 30
        val c = when (k) {
            "minor" -> if (u) H.SEGMENT_FREQUENT_TICK else H.CLOCK_TICK
            "major" -> if (u) H.SEGMENT_TICK else H.CONTEXT_CLICK
            "toggle" -> if (u) H.TOGGLE_ON else H.CONTEXT_CLICK
            "confirm" -> if (r) H.CONFIRM else H.LONG_PRESS
            "reject" -> if (r) H.REJECT else H.LONG_PRESS
            else -> H.KEYBOARD_TAP
        }
        activity.runOnUiThread { bridge.webView.performHapticFeedback(c); call.resolve() }
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val sdk = try { HealthConnectClient.getSdkStatus(context) } catch (e: Exception) { return call.reject(e.message ?: "Health Connect unavailable") }
        if (sdk != HealthConnectClient.SDK_AVAILABLE) { call.resolve(JSObject().put("available", false).put("sdk", sdk)); return }
        scope.launch {
            try {
                val g = client.permissionController.getGrantedPermissions()
                // the history permission is a bonus, not required
                val needed = perms - HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
                call.resolve(JSObject().put("available", true).put("sdk", sdk).put("granted", JSArray(g.toList())).put("all", g.containsAll(needed)))
            } catch (e: Exception) { call.reject(e.message ?: "status failed") }
        }
    }

    @PluginMethod
    fun request(call: PluginCall) {
        val l = launcher ?: return call.reject("permission launcher not ready")
        pending = call
        activity.runOnUiThread { try { l.launch(perms) } catch (e: Exception) { pending = null; call.reject(e.message ?: "could not open Health Connect") } }
    }

    @PluginMethod
    fun install(call: PluginCall) {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(i) } catch (e: Exception) { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        call.resolve()
    }

    private fun range(call: PluginCall): TimeRangeFilter {
        val a = num(call, "start") ?: throw IllegalArgumentException("start missing"); val b = num(call, "end") ?: throw IllegalArgumentException("end missing")
        return TimeRangeFilter.between(Instant.ofEpochMilli(a.toLong()), Instant.ofEpochMilli(b.toLong()))
    }
    private fun originFilter(call: PluginCall): Set<DataOrigin> = try { call.getArray("origins")?.toList<String>()?.map { DataOrigin(it) }?.toSet() ?: emptySet() } catch (e: Exception) { emptySet() }

    private suspend fun <T : Record> readAll(k: KClass<T>, r: TimeRangeFilter, o: Set<DataOrigin>): List<T> {
        val out = ArrayList<T>(); var token: String? = null
        do {
            val res = client.readRecords(ReadRecordsRequest(k, r, o, true, 1000, token))
            out.addAll(res.records); token = res.pageToken
        } while (!token.isNullOrEmpty())
        return out
    }

    private fun off(z: ZoneOffset?): Any = z?.totalSeconds ?: JSONObject.NULL
    private fun pt(t: Instant, z: ZoneOffset?, v: Double) = JSObject().put("t", t.toEpochMilli()).put("o", off(z)).put("v", v)
    private fun kind(t: Int): String = when (t) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "RUNNING"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "WEIGHTLIFTING"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "STRENGTH_TRAINING"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "WALKING"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING, ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "BIKING"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "HIKING"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL, ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "SWIMMING"
        else -> "OTHER"
    }

    @PluginMethod
    fun read(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type missing")
        if (type !in types) return call.reject("unknown type $type")
        val r = try { range(call) } catch (e: Exception) { return call.reject(e.message) }; val o = originFilter(call)
        scope.launch {
            try {
                val out = JSArray()
                when (type) {
                    "sleep" -> readAll(SleepSessionRecord::class, r, o).forEach { s ->
                        val st = JSArray(); s.stages.forEach { g -> st.put(JSArray().put(g.stage).put(g.startTime.toEpochMilli()).put(g.endTime.toEpochMilli())) }
                        out.put(JSObject().put("start", s.startTime.toEpochMilli()).put("end", s.endTime.toEpochMilli()).put("so", off(s.startZoneOffset)).put("eo", off(s.endZoneOffset)).put("origin", s.metadata.dataOrigin.packageName).put("stages", st))
                    }
                    "restingHr" -> readAll(RestingHeartRateRecord::class, r, o).forEach { out.put(pt(it.time, it.zoneOffset, it.beatsPerMinute.toDouble())) }
                    "hrv" -> readAll(HeartRateVariabilityRmssdRecord::class, r, o).forEach { out.put(pt(it.time, it.zoneOffset, it.heartRateVariabilityMillis)) }
                    "spo2" -> readAll(OxygenSaturationRecord::class, r, o).forEach { out.put(pt(it.time, it.zoneOffset, it.percentage.value)) }
                    "resp" -> readAll(RespiratoryRateRecord::class, r, o).forEach { out.put(pt(it.time, it.zoneOffset, it.rate)) }
                    "vo2" -> readAll(Vo2MaxRecord::class, r, o).forEach { out.put(pt(it.time, it.zoneOffset, it.vo2MillilitersPerMinuteKilogram)) }
                    "heartRate" -> readAll(HeartRateRecord::class, r, o).forEach { h -> h.samples.forEach { out.put(pt(it.time, h.startZoneOffset, it.beatsPerMinute.toDouble())) } }
                    "skinTemp" -> readAll(SkinTemperatureRecord::class, r, o).forEach { s ->
                        val d = JSArray(); s.deltas.forEach { x -> d.put(JSArray().put(x.time.toEpochMilli()).put(x.delta.inCelsius)) }
                        out.put(JSObject().put("start", s.startTime.toEpochMilli()).put("end", s.endTime.toEpochMilli()).put("eo", off(s.endZoneOffset)).put("base", s.baseline?.inCelsius ?: JSONObject.NULL).put("deltas", d))
                    }
                    "exercise" -> readAll(ExerciseSessionRecord::class, r, o).forEach { e ->
                        val w = JSObject().put("start", e.startTime.toEpochMilli()).put("end", e.endTime.toEpochMilli()).put("so", off(e.startZoneOffset)).put("type", kind(e.exerciseType)).put("title", e.title ?: JSONObject.NULL)
                        try {   // average heart rate and distance inside the session, from the same app
                            val src = setOf(e.metadata.dataOrigin)
                            val a = client.aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG, DistanceRecord.DISTANCE_TOTAL), TimeRangeFilter.between(e.startTime, e.endTime), src))
                            a[HeartRateRecord.BPM_AVG]?.let { w.put("avgHr", it) }
                            a[DistanceRecord.DISTANCE_TOTAL]?.let { w.put("distanceM", it.inMeters) }
                        } catch (_: Exception) { }
                        out.put(w)
                    }
                    else -> { }   // distance is only used through aggregate, inside exercise
                }
                call.resolve(JSObject().put("records", out))
            } catch (e: Exception) { call.reject(e.message ?: "read failed") }
        }
    }

    // Active zone minutes are not stored in Health Connect, so they are worked out from heart rate, one minute at a time:
    // heart-rate reserve % = (bpm - resting) / (max - resting); fat burn 40-59 %, cardio 60-84 %, peak 85 %+ (Fitbit's published zones).
    // The page then counts fat-burn minutes once and cardio/peak minutes twice, as Fitbit does.
    @PluginMethod
    fun activeZoneMinutes(call: PluginCall) {
        val start = num(call, "start")?.toLong() ?: return call.reject("start missing"); val end = num(call, "end")?.toLong() ?: return call.reject("end missing")
        val rest = num(call, "rest") ?: 60.0; val max = num(call, "max") ?: 198.0; val o = originFilter(call)
        scope.launch {
            try {
                val zone = ZoneId.systemDefault(); val perDay = sortedMapOf<String, IntArray>()
                var t = start
                while (t < end) {   // one day at a time keeps memory small
                    val t2 = minOf(end, t + 86_400_000L)
                    val mins = HashMap<Long, DoubleArray>()
                    readAll(HeartRateRecord::class, TimeRangeFilter.between(Instant.ofEpochMilli(t), Instant.ofEpochMilli(t2)), o).forEach { h ->
                        h.samples.forEach { s -> val m = s.time.epochSecond / 60; val a = mins.getOrPut(m) { DoubleArray(2) }; a[0] += s.beatsPerMinute.toDouble(); a[1] += 1.0 }
                    }
                    for ((m, a) in mins) {
                        val hrr = (a[0] / a[1] - rest) / (max - rest)
                        val z = when { hrr >= 0.85 -> 2; hrr >= 0.60 -> 1; hrr >= 0.40 -> 0; else -> -1 }
                        if (z < 0) continue
                        val date = Instant.ofEpochSecond(m * 60).atZone(zone).toLocalDate().toString()
                        perDay.getOrPut(date) { IntArray(3) }[z]++
                    }
                    t = t2
                }
                val out = JSArray()
                perDay.forEach { (d, z) -> out.put(JSObject().put("date", d).put("fat", z[0]).put("cardio", z[1]).put("peak", z[2])) }
                call.resolve(JSObject().put("days", out))
            } catch (e: Exception) { call.reject(e.message ?: "zone minutes failed") }
        }
    }

    @PluginMethod
    fun origins(call: PluginCall) {
        val r = try { range(call) } catch (e: Exception) { return call.reject(e.message) }
        scope.launch {
            val count = sortedMapOf<String, Int>()
            for (k in listOf(SleepSessionRecord::class, RestingHeartRateRecord::class, HeartRateVariabilityRmssdRecord::class, HeartRateRecord::class, ExerciseSessionRecord::class)) {
                try { readAll(k, r, emptySet()).forEach { val p = it.metadata.dataOrigin.packageName; count[p] = (count[p] ?: 0) + 1 } } catch (_: Exception) { }
            }
            val o = JSObject(); count.forEach { (p, n) -> o.put(p, n) }
            call.resolve(JSObject().put("origins", o))
        }
    }
}
