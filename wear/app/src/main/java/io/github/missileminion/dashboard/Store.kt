package io.github.missileminion.dashboard

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.random.Random

// One logged set, the same shape as the phone and web gym log: weight is always in pounds.
data class Entry(val id: Long, val date: String, val day: String, val exercise: String, val weight: Double, val reps: Int, val sets: Int) {
    fun json(): JSONObject = JSONObject().put("id", id).put("date", date).put("day", day).put("exercise", exercise).put("weight", weight).put("reps", reps).put("sets", sets)
    companion object {
        fun of(o: JSONObject) = Entry(o.getLong("id"), o.getString("date"), o.optString("day"), o.getString("exercise"), o.getDouble("weight"), o.optInt("reps", 0), o.optInt("sets", 1))
    }
}

const val KG = 0.45359237

// The watch's copy of the gym log. What the phone last published (/gym/state: program, unit, step, the latest set of each
// exercise, today's sets) plus every set made on this watch in the last few weeks. Sets made here go to the phone as data
// items (/gym/add/<id>), which Google Play services delivers over Bluetooth whenever the two are connected, even if the
// phone app is closed at the time. An undo goes the same way (/gym/del/<id>).
object Store {
    private const val PREFS = "gym"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var app: Context

    // the split, in case the phone has not sent its program yet (same as app/js/gymlog.js)
    private val DEFAULT_PROGRAM = linkedMapOf(
        "Legs" to listOf("Hack squat / pendulum squat" to "3 × 6–10", "Leg extension" to "3 × 10–15", "Seated leg curl" to "3 × 10–12", "Standing calf raise" to "3 × 8–12", "Cable crunch" to "4 × 10–15",
            "Leg press (feet high & wide)" to "3 × 8–12", "Hip thrust machine" to "3 × 8–12", "Seated leg curl / 45° back extension" to "3 × 10–12", "Seated calf raise" to "3 × 10–15",
            "Machine lateral raise" to "5 × 12–15", "Hanging leg raise / weighted decline sit-up" to "3 × 10–15"),
        "Pull" to listOf("Lat pulldown" to "3 × 8–12", "Chest-supported row machine" to "3 × 8–10", "Single-arm cable pulldown" to "2 × 10–12", "Reverse pec deck" to "3 × 12–15",
            "Bayesian cable curl" to "3 × 8–12", "Smith machine shrug" to "3 × 10–15", "Cable reverse curl" to "2 × 12–15", "Neutral-grip pulldown / weighted pull-up" to "3 × 6–10",
            "Seated cable row" to "3 × 8–12", "Cable rear-delt fly" to "3 × 12–15", "Machine preacher curl" to "3 × 8–12", "Cable shrug" to "3 × 10–15", "Cable wrist curl" to "2 × 12–20"),
        "Push" to listOf("Incline Smith press (30°)" to "3 × 6–10", "Machine chest press" to "3 × 8–10", "Cable lateral raise" to "5 × 10–15", "Pec deck" to "2 × 12–15",
            "Overhead cable triceps extension" to "3 × 10–12", "Machine shoulder press" to "3 × 6–10", "Incline machine press" to "3 × 8–12", "Low-to-high cable fly" to "2 × 12–15", "Cable triceps pushdown" to "3 × 10–12"),
    )
    private val DEFAULT_WEEK = listOf("Pull", "Legs", "Push", null, "Pull", "Legs", "Push")   // Sun..Sat; Wednesday is the run/rest day

    var program by mutableStateOf<Map<String, List<Pair<String, String>>>>(DEFAULT_PROGRAM); private set
    var week by mutableStateOf(DEFAULT_WEEK); private set
    var unit by mutableStateOf("lb"); private set
    var step by mutableStateOf(1.0)
    var phoneEntries by mutableStateOf(listOf<Entry>()); private set
    var mine by mutableStateOf(listOf<Entry>()); private set        // made on this watch
    var deleted by mutableStateOf(setOf<Long>()); private set
    var synced by mutableStateOf(0L); private set
    var paceTarget by mutableStateOf(0); private set                // s/km from the phone (Body → Run), 0 = off                   // when the phone last published

    val all: List<Entry> get() { val m = LinkedHashMap<Long, Entry>(); phoneEntries.forEach { m[it.id] = it }; mine.forEach { m[it.id] = it }; return m.values.filter { it.id !in deleted } }
    fun today() = LocalDate.now().toString()
    fun todays() = all.filter { it.date == today() }.sortedByDescending { it.id }
    fun lastOf(ex: String) = all.filter { it.exercise == ex }.maxWithOrNull(compareBy<Entry>({ it.date }, { it.id }))
    fun scheduled(): String { val g = LocalDate.now().dayOfWeek.value % 7; for (k in 0 until 7) { val w = week[(g + k) % 7]; if (w != null && program.containsKey(w)) return w }; return program.keys.first() }
    fun toDisp(lb: Double) = if (unit == "kg") lb * KG else lb
    fun toLb(v: Double) = if (unit == "kg") Math.round(v / KG * 100) / 100.0 else v

    // lb or kg per exercise (a hidden switch on the weight screen: hold the unit). Unset = the phone's unit. Weights stay stored in lb.
    var units by mutableStateOf(mapOf<String, String>()); private set
    fun unitFor(ex: String) = units[ex] ?: unit
    fun dispFor(ex: String, lb: Double) = if (unitFor(ex) == "kg") lb * KG else lb
    fun lbFor(ex: String, v: Double) = if (unitFor(ex) == "kg") Math.round(v / KG * 100) / 100.0 else v
    fun toggleUnit(ex: String) { units = units + (ex to if (unitFor(ex) == "kg") "lb" else "kg"); save() }

    fun init(ctx: Context) {
        if (::app.isInitialized) return; app = ctx.applicationContext
        val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        p.getString("state", null)?.let { runCatching { applyState(JSONObject(it), save = false) } }
        mine = runCatching { JSONArray(p.getString("mine", "[]")).let { a -> (0 until a.length()).map { Entry.of(a.getJSONObject(it)) } } }.getOrDefault(emptyList())
        deleted = runCatching { JSONArray(p.getString("deleted", "[]")).let { a -> (0 until a.length()).map { a.getLong(it) }.toSet() } }.getOrDefault(emptySet())
        p.getString("lastRun", null)?.let { runCatching { JSONObject(it).let { o -> lastRun = RunSummary(o.getDouble("km"), o.getLong("sec"), o.getLong("pace").takeIf { v -> v >= 0 }, o.getLong("at")) } } }
        if (p.contains("step")) step = p.getFloat("step", 1f).toDouble()
        units = runCatching { JSONObject(p.getString("units", "{}")).let { o -> o.keys().asSequence().associateWith { o.getString(it) } } }.getOrDefault(emptyMap())
        scope.launch {   // whatever the phone published while the app was closed
            runCatching { Wearable.getDataClient(app).dataItems.await().use { buf -> buf.forEach { val j = DataMapItem.fromDataItem(it).dataMap.getString("json") ?: return@forEach; when (it.uri.path) { "/gym/state" -> applyState(JSONObject(j)); "/face/state" -> FaceData.apply(app, j) } } } }
        }
    }

    private fun save() {
        val cutoff = LocalDate.now().minusDays(28).toString()
        mine = mine.filter { it.date >= cutoff }
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("mine", JSONArray(mine.map { it.json() }).toString())
            .putString("deleted", JSONArray(deleted.toList().takeLast(200)).toString())
            .putFloat("step", step.toFloat())
            .putString("units", JSONObject(units).toString()).apply()
    }
    fun saveStep() = save()

    // the last finished run, kept on the watch only (for the Run tile): distance, active time, average pace
    data class RunSummary(val km: Double, val sec: Long, val pace: Long?, val at: Long)
    var lastRun by mutableStateOf<RunSummary?>(null); private set
    fun saveRun(km: Double, sec: Long) {
        val r = RunSummary(km, sec, if (km > 0.05) (sec / km).toLong() else null, System.currentTimeMillis()); lastRun = r
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("lastRun", JSONObject().put("km", r.km).put("sec", r.sec).put("pace", r.pace ?: -1).put("at", r.at).toString()).apply()
        Tiles.refresh(app)
    }

    fun applyState(o: JSONObject, save: Boolean = true) {
        o.optJSONObject("program")?.let { pr ->
            val m = LinkedHashMap<String, List<Pair<String, String>>>()
            pr.keys().forEach { k -> val a = pr.getJSONArray(k); m[k] = (0 until a.length()).map { i -> a.getJSONArray(i).let { it.getString(0) to it.optString(1) } } }
            if (m.isNotEmpty()) program = m
        }
        o.optJSONArray("week")?.let { a -> if (a.length() == 7) week = (0 until 7).map { if (a.isNull(it)) null else a.getString(it) } }
        unit = o.optString("unit", unit).takeIf { it == "kg" || it == "lb" } ?: unit
        if (o.has("step")) { step = o.optDouble("step", step) }
        if (o.has("paceTarget")) paceTarget = o.optInt("paceTarget", 0)
        o.optJSONArray("entries")?.let { a -> phoneEntries = (0 until a.length()).mapNotNull { runCatching { Entry.of(a.getJSONObject(it)) }.getOrNull() } }
        synced = System.currentTimeMillis()
        if (save) { app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("state", o.toString()).apply(); this.save() }
    }

    fun log(day: String, exercise: String, weightLb: Double, reps: Int, sets: Int): Entry {
        val e = Entry(System.currentTimeMillis() + Random.nextInt(1000), today(), day, exercise, weightLb, reps, sets)
        mine = mine + e; save()
        send("/gym/add/${e.id}", e.json().toString())
        Tiles.refresh(app)
        return e
    }

    fun sendRun(json: String) { send("/run/add/${org.json.JSONObject(json).getLong("id")}", json) }

    fun undo(id: Long) {
        mine = mine.filter { it.id != id }; deleted = deleted + id; save()
        send("/gym/del/$id", "{}"); Tiles.refresh(app)
    }

    private fun send(path: String, json: String) = scope.launch {
        runCatching {
            val req = PutDataMapRequest.create(path).apply { dataMap.putString("json", json) }
            Wearable.getDataClient(app).putDataItem(req.asPutDataRequest().setUrgent()).await()
        }
    }

    fun onData(events: DataEventBuffer) {
        for (ev in events) if (ev.type == DataEvent.TYPE_CHANGED) when (ev.dataItem.uri.path) {
            "/gym/state" -> runCatching { DataMapItem.fromDataItem(ev.dataItem).dataMap.getString("json")?.let { applyState(JSONObject(it)) } }
            "/face/state" -> runCatching { DataMapItem.fromDataItem(ev.dataItem).dataMap.getString("json")?.let { FaceData.apply(app, it); FaceSources.refresh(app) } }
        }
    }
}

// Woken by the system when the phone publishes a new state, even while the app is closed.
class StateListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) { Store.init(applicationContext); Store.onData(events) }
}

