package io.github.missileminion.dashboard

import android.content.Context
import org.json.JSONObject

// What the watch face shows, as the phone last sent it (/face/state): today's call, readiness, bed-by time, wake goal, weather and
// its place, sunrise/sunset, and the events of the next day or so (start and end as epoch ms). Kept in preferences, so the face has
// it at once after a restart. The face's hub and event ring (FaceSources.kt) are redrawn whenever a new copy arrives.
object FaceData {
    data class Ev(val start: Long, val end: Long, val title: String)
    @Volatile var call = ""; @Volatile var readiness = ""; @Volatile var bedBy = ""; @Volatile var wake = "06:30"
    @Volatile var weather = ""; @Volatile var place = ""; @Volatile var sunrise = ""; @Volatile var sunset = ""
    @Volatile var events: List<Ev> = emptyList()
    @Volatile var at = 0L
    private var loaded = false

    fun load(ctx: Context) { if (loaded) return; loaded = true; ctx.getSharedPreferences("face", Context.MODE_PRIVATE).getString("json", null)?.let { runCatching { parse(it) } } }

    fun apply(ctx: Context, json: String) {
        runCatching { parse(json); ctx.getSharedPreferences("face", Context.MODE_PRIVATE).edit().putString("json", json).apply() }
    }

    private fun parse(json: String) {
        val o = JSONObject(json)
        call = o.optString("call"); readiness = o.optString("readiness"); bedBy = o.optString("bedBy"); wake = o.optString("wake", "06:30")
        weather = o.optString("weather"); place = o.optString("place"); sunrise = o.optString("sunrise"); sunset = o.optString("sunset")
        events = o.optJSONArray("events")?.let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { Ev(it.optLong("s"), it.optLong("e"), it.optString("t")) } } }.orEmpty()
        at = o.optLong("at")
    }
}
