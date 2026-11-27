package io.github.missileminion.dashboard

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.SmallImage
import androidx.wear.watchface.complications.data.SmallImageComplicationData
import androidx.wear.watchface.complications.data.SmallImageType
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.TimeFormatComplicationText
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import java.time.ZonedDateTime
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

// The live parts of the CORE · INSTRUMENT watch face (wear-face/), supplied by this app as complications:
//   HubSource  — the hub's two lines: the time and the next event; a tap cycles readiness · call, bed-by, weather · place.
//   RingSource — a transparent image of the event ring (the next 12 hours of calendar events; the one in progress filled up to now)
//                and the bed-by crescent, drawn on exactly the same dot grid as the face, so the dots land on the face's dots.
// Both refresh when the phone sends new data (FaceSources.refresh) and every 5 minutes.
object FaceSources {
    fun refresh(ctx: Context) = runCatching {
        ComplicationDataSourceUpdateRequester.create(ctx, ComponentName(ctx, HubSource::class.java)).requestUpdateAll()
        ComplicationDataSourceUpdateRequester.create(ctx, ComponentName(ctx, RingSource::class.java)).requestUpdateAll()
    }
    private val CHARS = ("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:·-+.° ").toSet()
    fun clean(s: String, max: Int = 11): String {   // only what the face's 3×5 micro type can draw
        val c = s.uppercase().map { if (it in CHARS) it else ' ' }.joinToString("").replace(Regex(" +"), " ").trim()
        return if (c.length > max) c.take(max - 1).trimEnd() + "." else c
    }
    fun hubMode(ctx: Context) = ctx.getSharedPreferences("face", Context.MODE_PRIVATE).getInt("hub", 0)
    fun cycleHub(ctx: Context) { val p = ctx.getSharedPreferences("face", Context.MODE_PRIVATE); p.edit().putInt("hub", (p.getInt("hub", 0) + 1) % 4).apply() }
    fun next(now: Long = System.currentTimeMillis()) = FaceData.events.filter { it.end > now && it.start < now + 12 * 3600_000 }.minByOrNull { it.start }
}

class HubTap : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        FaceSources.cycleHub(context)
        ComplicationDataSourceUpdateRequester.create(context, ComponentName(context, HubSource::class.java)).requestUpdateAll()
    }
}

class HubSource : SuspendingComplicationDataSourceService() {
    private fun plain(s: String): ComplicationText = PlainComplicationText.Builder(s).build()
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        if (request.complicationType != ComplicationType.SHORT_TEXT) return null
        FaceData.load(this)
        val call = FaceSources.clean(FaceData.call)
        val (big, small) = when (FaceSources.hubMode(this)) {
            0 -> TimeFormatComplicationText.Builder("HH:mm").build() to (FaceSources.next()?.let { FaceSources.clean(it.title) } ?: call.ifEmpty { "CLEAR" })
            1 -> plain(FaceSources.clean(FaceData.readiness.ifEmpty { "-" })) to call.ifEmpty { "READY · SD" }
            2 -> plain(FaceData.bedBy.ifEmpty { "-" }) to "BED BY"
            else -> plain(FaceSources.clean(FaceData.weather.ifEmpty { "-" })) to FaceSources.clean(FaceData.place).ifEmpty { "WEATHER" }
        }
        val tap = PendingIntent.getBroadcast(this, 1, Intent(this, HubTap::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return ShortTextComplicationData.Builder(big, plain("Core hub")).setTitle(plain(small)).setTapAction(tap).build()
    }
    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type != ComplicationType.SHORT_TEXT) null
        else ShortTextComplicationData.Builder(plain("10:08"), plain("Core hub")).setTitle(plain("ROCKETRY")).build()
}

class RingSource : SuspendingComplicationDataSourceService() {
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        if (request.complicationType != ComplicationType.SMALL_IMAGE) return null   // a full-face image, sent as a "photo" small image (the type the system allows as a default)
        FaceData.load(this)
        return SmallImageComplicationData.Builder(SmallImage.Builder(Ring.icon(ZonedDateTime.now()), SmallImageType.PHOTO).build(), PlainComplicationText.Builder("Events and bed-by").build()).build()
    }
    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type != ComplicationType.SMALL_IMAGE) null
        else SmallImageComplicationData.Builder(SmallImage.Builder(Ring.icon(ZonedDateTime.now(), preview = true), SmallImageType.PHOTO).build(), PlainComplicationText.Builder("Events and bed-by").build()).build()
}

// the ring image: same grid as the face (rings every 7.6 from 48, dots 7.6 apart), drawn at 450 px
private object Ring {
    // drawn at 300 px (larger images are dropped on the way); the face scales it to fill
    private const val S = 300; private const val K = S / 480f; private const val C = 240f; private const val TAU = (2 * PI).toFloat()
    private fun cmDist(a: Float, b: Float): Float { val d = abs(a - b) % 720; return min(d, 720 - d) }
    private fun inArc(cm: Float, a0: Float, b0: Float): Boolean { val a = ((a0 % 720) + 720) % 720; val b = ((b0 % 720) + 720) % 720; return if (a < b) cm >= a && cm < b else cm >= a || cm < b }
    private class P(val r: Float, val x: Float, val y: Float, val cm: Float, val tick: Float)
    private val pts: List<P> by lazy {
        val out = ArrayList<P>(); val rings = generateSequence(48f) { it + 7.6f }.takeWhile { it <= 226f }.toList()
        val rt = rings.minBy { abs(it - 222.8f) }
        for (r in rings) { if (r <= 196 || r >= 218) continue
            val n = (TAU * r / 7.6f).roundToInt(); val half = 720f / n / 2
            for (i in 0 until n) { val a = i.toFloat() / n * TAU - (PI / 2).toFloat(); val cm = i.toFloat() / n * 720
                val mn = r == rt && cmDist(cm, (cm / 12).roundToInt() * 12f) < half; val five = mn && cmDist(cm, (cm / 60).roundToInt() * 60f) < half
                out.add(P(r, C + r * cos(a), C + r * sin(a), cm, if (five) 1f else if (mn) .45f else 0f)) } }
        out
    }

    fun icon(z: ZonedDateTime, preview: Boolean = false): Icon {
        val bmp = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888); val c = Canvas(bmp); c.scale(K, K)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF4F3EF.toInt() }
        val now = z.hour * 60 + z.minute + z.second / 60f
        val midnight = z.toLocalDate().atStartOfDay(z.zone).toInstant().toEpochMilli()
        val evs = (if (preview) listOf(Triple(now - 30, now + 30, ""), Triple(now + 90, now + 150, "")) else
            FaceData.events.map { Triple((it.start - midnight) / 60000f, (it.end - midnight) / 60000f, it.title) })
            .filter { it.second > now && it.first < now + 720 }.sortedBy { it.first }
        val next = evs.firstOrNull()
        for (p in pts) {
            var ev = 0f; var evA = 0f
            for (v in evs) {
                if (!inArc(p.cm, v.first % 720, v.second % 720)) continue
                val dim = if (v === next) 1f else .55f
                if (v.first <= now) { val dn = inArc(p.cm, v.first % 720, now % 720); ev = (if (dn) 1.1f else .6f) * dim; evA = (if (dn) 1f else .5f) * dim }
                else { ev = .8f * dim; evA = .78f * dim }
            }
            if (ev <= 0f) continue
            val r = .58f + ev * .95f + p.tick * .9f; val a = min(1f, .13f + evA * .55f + p.tick * .45f)
            paint.alpha = (a * 255).roundToInt(); c.drawCircle(p.x, p.y, r, paint)
        }
        // bed-by: a crescent on the ring at its clock position, when it is within 12 hours
        val bed = runCatching { val (h, m) = FaceData.bedBy.split(":").map { it.toInt() }; h * 60 + m }.getOrNull() ?: if (preview) 23 * 60 + 40 else null
        if (bed != null) { var b = bed.toFloat(); if (b < now) b += 1440
            if (b - now < 720) { val ang = (b % 720) / 720 * TAU - (PI / 2).toFloat(); val x = C + 207.6f * cos(ang); val y = C + 207.6f * sin(ang)
                val cres = Path().apply { addCircle(x, y, 4f, Path.Direction.CW) }; cres.op(Path().apply { addCircle(x + 2, y - 1.5f, 3.5f, Path.Direction.CW) }, Path.Op.DIFFERENCE)
                paint.alpha = (.85f * 255).roundToInt(); c.drawPath(cres, paint) } }
        return Icon.createWithBitmap(bmp)   // a plain bitmap: the system can't pass on compressed image bytes
    }
}
