package io.github.missileminion.dashboard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.view.SurfaceHolder
import androidx.wear.watchface.CanvasType
import androidx.wear.watchface.ComplicationSlot
import androidx.wear.watchface.ComplicationSlotsManager
import androidx.wear.watchface.DrawMode
import androidx.wear.watchface.Renderer
import androidx.wear.watchface.TapEvent
import androidx.wear.watchface.TapType
import androidx.wear.watchface.WatchFace
import androidx.wear.watchface.WatchFaceService
import androidx.wear.watchface.WatchFaceType
import androidx.wear.watchface.WatchState
import androidx.wear.watchface.style.CurrentUserStyleRepository
import java.time.ZonedDateTime
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

// CORE · INSTRUMENT, the owner's watch face (design: core-instrument.html), as a real Wear OS watch face.
// The whole dial is one polar halftone screen of dots. The hands are not drawn: they are soft fields that swell the dots they
// pass over, with a faint shadow cast away from a light above the glass. The outer ring carries the minute ticks and the next
// 12 hours of calendar events (the one in progress fills as it goes; the next one breathes when it is under an hour away), a
// crescent notch marks bed-by time, and hour markers are pairs of grid dots. The hub shows the time and the next event; tap it to
// cycle readiness, bed-by and the weather. Tilting the watch moves the light and bulges the dots like a lens.
// Always-on keeps only the hands and the hour markers, dimmed; waking eases every dot back to its active size from the centre out.
// Everything is drawn in a 480 × 480 space (the 44 mm Galaxy Watch8) and scaled to the screen.
class CoreFaceService : WatchFaceService() {
    override suspend fun createWatchFace(surfaceHolder: SurfaceHolder, watchState: WatchState, complicationSlotsManager: ComplicationSlotsManager,
                                         currentUserStyleRepository: CurrentUserStyleRepository): WatchFace {
        FaceData.load(this); Store.init(this)
        val r = CoreRenderer(this, surfaceHolder, watchState, currentUserStyleRepository)
        return WatchFace(WatchFaceType.ANALOG, r).setTapListener(r)
    }
}

private const val TAU = (2 * PI).toFloat()
private const val C = 240f
private const val INK = 0xFFF4F3EF.toInt()
private fun clamp(v: Float, a: Float = 0f, b: Float = 1f) = max(a, min(b, v))
private fun ease(x: Float) = 1 - (1 - x).pow(3)
private fun smooth(x: Float) = x * x * (3 - 2 * x)
private fun easeIO(x: Float) = if (x < .5f) 4 * x * x * x else 1 - (-2 * x + 2).pow(3) / 2
private fun mix(a: Float, b: Float, e: Float) = a + (b - a) * e
private fun cmDist(a: Float, b: Float): Float { val d = abs(a - b) % 720; return min(d, 720 - d) }
private fun inArc(cm: Float, a0: Float, b0: Float): Boolean { val a = ((a0 % 720) + 720) % 720; val b = ((b0 % 720) + 720) % 720; return if (a < b) cm >= a && cm < b else cm >= a || cm < b }
private fun toMin(t: String): Int? = runCatching { val (h, m) = t.split(":").map { it.trim().toInt() }; h * 60 + m }.getOrNull()

private class Pt(val r: Float, val bx: Float, val by: Float, val cm: Float) {
    var s = .6f; var al = 0f; var min = false; var five = false; var hr = -1
}

// 3×5 micro type
private val MICRO: Map<Char, List<String>> = mapOf(
    'A' to listOf(".#.", "#.#", "###", "#.#", "#.#"), 'B' to listOf("##.", "#.#", "##.", "#.#", "##."), 'C' to listOf(".##", "#..", "#..", "#..", ".##"),
    'D' to listOf("##.", "#.#", "#.#", "#.#", "##."), 'E' to listOf("###", "#..", "##.", "#..", "###"), 'F' to listOf("###", "#..", "##.", "#..", "#.."),
    'G' to listOf(".##", "#..", "#.#", "#.#", ".##"), 'H' to listOf("#.#", "#.#", "###", "#.#", "#.#"), 'I' to listOf("###", ".#.", ".#.", ".#.", "###"),
    'J' to listOf("..#", "..#", "..#", "#.#", ".#."), 'K' to listOf("#.#", "#.#", "##.", "#.#", "#.#"), 'L' to listOf("#..", "#..", "#..", "#..", "###"),
    'M' to listOf("#.#", "###", "###", "#.#", "#.#"), 'N' to listOf("##.", "#.#", "#.#", "#.#", "#.#"), 'O' to listOf(".#.", "#.#", "#.#", "#.#", ".#."),
    'P' to listOf("##.", "#.#", "##.", "#..", "#.."), 'Q' to listOf(".#.", "#.#", "#.#", "##.", ".##"), 'R' to listOf("##.", "#.#", "##.", "#.#", "#.#"),
    'S' to listOf(".##", "#..", ".#.", "..#", "##."), 'T' to listOf("###", ".#.", ".#.", ".#.", ".#."), 'U' to listOf("#.#", "#.#", "#.#", "#.#", "###"),
    'V' to listOf("#.#", "#.#", "#.#", "#.#", ".#."), 'W' to listOf("#.#", "#.#", "###", "###", "#.#"), 'X' to listOf("#.#", "#.#", ".#.", "#.#", "#.#"),
    'Y' to listOf("#.#", "#.#", ".#.", ".#.", ".#."), 'Z' to listOf("###", "..#", ".#.", "#..", "###"),
    '0' to listOf("###", "#.#", "#.#", "#.#", "###"), '1' to listOf(".#.", "##.", ".#.", ".#.", "###"), '2' to listOf("##.", "..#", ".#.", "#..", "###"),
    '3' to listOf("##.", "..#", ".#.", "..#", "##."), '4' to listOf("#.#", "#.#", "###", "..#", "..#"), '5' to listOf("###", "#..", "##.", "..#", "##."),
    '6' to listOf(".##", "#..", "###", "#.#", "###"), '7' to listOf("###", "..#", ".#.", ".#.", ".#."), '8' to listOf("###", "#.#", "###", "#.#", "###"),
    '9' to listOf("###", "#.#", "###", "..#", "##."), ':' to listOf(".", "#", ".", "#", "."), '·' to listOf(".", ".", "#", ".", "."),
    '-' to listOf("...", "...", "###", "...", "..."), '+' to listOf("...", ".#.", "###", ".#.", "..."), '.' to listOf(".", ".", ".", ".", "#"),
    '°' to listOf("##", "##", "..", "..", ".."), ' ' to listOf("..", "..", "..", "..", ".."),
)
// text as dot positions, centred on cx, top at `top`, cell pitch p
private fun micro(s: String, cx: Float, top: Float, p: Float): List<FloatArray> {
    val cells = ArrayList<FloatArray>(); var col = 0
    for (ch in s) { val g = MICRO[ch] ?: MICRO[' ']!!; g.forEachIndexed { ry, row -> row.forEachIndexed { rx, v -> if (v == '#') cells.add(floatArrayOf((col + rx) * p, ry.toFloat())) } }; col += g[0].length + 1 }
    val w = (col - 2) * p
    return cells.map { floatArrayOf(cx - w / 2 + it[0], top + it[1] * p) }
}
// only what the micro type can draw; long names shortened
private fun clean(s: String) = s.uppercase().map { if (MICRO.containsKey(it)) it else ' ' }.joinToString("").replace(Regex(" +"), " ").trim()
private fun short(s: String) = if (s.length > 11) s.take(10).trimEnd() + "." else s

private class CoreRenderer(ctx: Context, holder: SurfaceHolder, private val watchState: WatchState, repo: CurrentUserStyleRepository) :
    Renderer.CanvasRenderer2<Renderer.SharedAssets>(holder, repo, watchState, CanvasType.HARDWARE, 40L, false), WatchFace.TapListener, SensorEventListener {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = INK; style = Paint.Style.FILL }
    private val pts = ArrayList<Pt>()
    private val sensors = ctx.getSystemService(SensorManager::class.java)
    private var sensorOn = false
    private val loadAt = SystemClock.uptimeMillis()

    // tilt (gravity sensor): what the sensor wants, and the eased value used
    private var wantX = 0f; private var wantY = 0f; private var tiltX = 0f; private var tiltY = 0f; private var lastInput = -1e9.toLong()
    // always-on blend: 0 active → 1 always-on
    private var ambFrom = 0f; private var ambTo = 0f; private var ambStart = 0L; private var ambDur = 800L; private var wasAmbient = false
    // hub
    private var hubI = 0; private var shownI = 0; private var prevI = 0; private var swapT = -1e9.toLong()
    private val crescent = Path(); private val cut = Path()

    init {
        val rt = run { var best = 48f; var r = 48f; while (r <= 226f) { if (abs(r - 222.8f) < abs(best - 222.8f)) best = r; r += 7.6f }; best }
        var r = 48f
        while (r <= 226f) {
            val n = (TAU * r / 7.6f).roundToInt()
            for (i in 0 until n) {
                val a = i.toFloat() / n * TAU - (PI / 2).toFloat()
                val p = Pt(r, C + r * cos(a), C + r * sin(a), i.toFloat() / n * 720f)
                val half = 720f / n / 2
                p.min = r == rt && cmDist(p.cm, (p.cm / 12).roundToInt() * 12f) < half
                p.five = p.min && cmDist(p.cm, (p.cm / 60).roundToInt() * 60f) < half
                p.hr = if (r > 170 && cmDist(p.cm, (p.cm / 60).roundToInt() * 60f) < half * 1.05f) ((p.cm / 60).roundToInt() % 12) else -1
                pts.add(p)
            }
            r += 7.6f
        }
    }

    override suspend fun createSharedAssets() = object : SharedAssets { override fun onDestroy() {} }

    // ---- the tapered hand as a soft field: 1 on its axis, falling off sideways
    private fun hand(x: Float, y: Float, a: Float, w: Float, len: Float, taper: Float = .5f, start: Float = 50f): Float {
        val dx = x - C; val dy = y - C; val ca = cos(a); val sa = sin(a); val along = dx * ca + dy * sa
        if (along < start - 10 || along > len + 12) return 0f
        val perp = abs(-dx * sa + dy * ca); val we = w * (1 - taper * clamp(along / len))
        var v = exp(-(perp * perp) / (2 * we * we))
        if (along > len) v *= exp(-((along - len) * (along - len)) / 30f)
        if (along < start) v *= exp(-((start - along) * (start - along)) / 30f)
        return v
    }

    private fun dot(c: Canvas, x: Float, y: Float, r: Float, a0: Float) {
        if (a0 < .01f || r < .06f) return
        paint.alpha = (min(1f, a0) * 255).roundToInt(); c.drawCircle(x, y, r, paint)
    }

    private fun ambAt(t: Long): Float { val q = clamp((t - ambStart).toFloat() / ambDur); return ambFrom + (ambTo - ambFrom) * easeIO(q) }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: SharedAssets) {
        val t = SystemClock.uptimeMillis()
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        // mode changes: to always-on at once (the system stops drawing frames), back to active as one continuous motion
        if (ambient != wasAmbient) {
            if (ambient) { ambFrom = 1f; ambTo = 1f } else { ambFrom = ambAt(t); ambTo = 0f; ambStart = t; ambDur = 800L }
            wasAmbient = ambient; setSensor(!ambient)
        } else if (!ambient && !sensorOn) setSensor(true)
        val e = if (ambient) 1f else ambAt(t)

        // tilt: the sensor when the wrist moves, a slow drift otherwise
        if (t - lastInput > 3000) { wantX = sin(t / 5200f) * .45f; wantY = cos(t / 6900f) * .32f }
        tiltX += (wantX - tiltX) * .06f; tiltY += (wantY - tiltY) * .06f
        val tx = tiltX * (1 - e); val ty = tiltY * (1 - e)
        val wake = clamp((t - loadAt) / 1400f)

        canvas.drawColor(Color.BLACK)
        canvas.save(); canvas.scale(bounds.width() / 480f, bounds.height() / 480f, bounds.left.toFloat(), bounds.top.toFloat()); canvas.translate(bounds.left.toFloat(), bounds.top.toFloat())

        val z = zonedDateTime; val sec = z.second + z.nano / 1e9f; val mn = z.minute + sec / 60; val hrs = (z.hour % 12) + mn / 60
        val hA = hrs / 12 * TAU - (PI / 2).toFloat(); val mA = mn / 60 * TAU - (PI / 2).toFloat(); val sA = sec / 60 * TAU - (PI / 2).toFloat()
        val now = z.hour * 60 + z.minute + sec / 60
        // the light above the glass
        val lx = C - 60 - tx * 170; val ly = C - 90 - ty * 170; val ldx = C - lx; val ldy = C - ly; val ln = hypot(ldx, ldy).takeIf { it > 0 } ?: 1f
        val sx = ldx / ln * 7; val sy = ldy / ln * 7
        // events in the next 12 hours, as minutes from today's midnight
        val midnight = z.toLocalDate().atStartOfDay(z.zone).toInstant().toEpochMilli()
        val evs = FaceData.events.map { Triple((it.start - midnight) / 60000f, (it.end - midnight) / 60000f, it.title) }.filter { it.second > now && it.first < now + 720 }.sortedBy { it.first }
        val next = evs.firstOrNull(); val br = .78f + .22f * sin(t / 650f)
        val bc = toMin(FaceData.bedBy)?.let { var b = it.toFloat(); if (b < now) b += 1440; if (b - now < 720) b % 720 else null }

        for (p in pts) {
            if (p.r < 62) continue
            val ed = smooth(clamp(e * 1.4f - .4f * (1 - p.r / 226f)))   // asleep: the rim dims first; waking: the centre returns first
            val hh = max(hand(p.bx, p.by, hA, 10.5f, 128f, .45f, 66f), hand(p.bx, p.by, mA, 6.6f, 200f, .4f, 66f))
            val sh = (1 - hh) * max(hand(p.bx - sx, p.by - sy, hA, 10.5f, 128f, .45f, 66f), hand(p.bx - sx, p.by - sy, mA, 6.6f, 200f, .4f, 66f))
            val seconds = if (ed < 1f) (1 - ed) * max(hand(p.bx, p.by, sA, 2.1f, 218f, 0f, 66f), hand(p.bx, p.by, sA + PI.toFloat(), 3.2f, 96f, 0f, 66f)) else 0f
            var ev = 0f; var evA = 0f
            if (p.r > 196 && p.r < 218) for (v in evs) {
                if (!inArc(p.cm, v.first % 720, v.second % 720)) continue
                val dim = if (v === next) 1f else .55f
                if (v.first <= now) { val dn = inArc(p.cm, v.first % 720, now % 720); ev = (if (dn) 1.1f else .6f) * dim; evA = (if (dn) 1f else .5f) * dim }
                else { ev = .8f * dim; evA = .78f * dim * (if (v === next && v.first - now < 60) br else 1f) }
            }
            val notch = bc != null && p.r > 196 && p.r < 218 && cmDist(p.cm, bc) < 6
            val tick = if (p.five) 1f else if (p.min) .45f else 0f
            var mk = 0f
            if (p.hr >= 0) { val ei = smooth(clamp(e * 1.25f - p.hr * .02f)); val rc = mix(181f, 219f, ei); mk = min(1f, exp(-((p.r - rc) * (p.r - rc)) / (2 * 3.4f * 3.4f)) / .54f) }
            // active
            val k0 = (p.r / 226f).pow(2) * 11; val xA = p.bx + tx * k0; val yA = p.by + ty * k0
            val g = exp(-((xA - lx) * (xA - lx) + (yA - ly) * (yA - ly)) / (2 * 115f * 115f))
            val grow = clamp((ease(wake) * 1.3f - p.r / 226f) * 3)
            val trA = if (notch) 0f else .58f * (1 - .62f * sh) + hh * 2.75f + seconds * 1.5f + ev * .95f + tick * .9f * (1 - mk) + mk * 1.05f + g * .2f
            val alA = if (notch) 0f else .13f * (1 - .6f * sh) + hh * .85f + seconds * .8f + evA * .55f + tick * .45f * (1 - mk) + mk * .5f + g * .12f
            // always-on: hands and hour markers only
            val on = hh > .35f; val trO = if (on) .4f + hh * 1.7f else mk * 1.15f; val alO = if (on) .5f else mk * .42f
            val tr = mix(trA * grow, trO, ed); val al = mix(alA * grow, alO, ed)
            if (ambient) { p.s = tr; p.al = al } else { p.s += (tr - p.s) * .22f; p.al += (al - p.al) * .22f }   // every change eases (always-on draws once a minute: no easing)
            dot(canvas, mix(xA, p.bx, ed), mix(yA, p.by, ed), p.s, p.al)
        }

        // bed-by crescent
        if (bc != null) {
            val a = bc / 60 / 12 * TAU - (PI / 2).toFloat(); val x = C + 207.6f * cos(a) + tx * 8; val y = C + 207.6f * sin(a) + ty * 8
            crescent.reset(); crescent.addCircle(x, y, 4f, Path.Direction.CW); cut.reset(); cut.addCircle(x + 2, y - 1.5f, 3.5f, Path.Direction.CW); crescent.op(cut, Path.Op.DIFFERENCE)
            paint.alpha = (mix(.85f, .4f, e) * clamp(wake * 2) * 255).roundToInt(); canvas.drawPath(crescent, paint)
        }

        // hub: time + next event; a tap cycles readiness, bed-by, weather, with a crossfade; always-on returns to time + event
        if (hubI != shownI) { prevI = shownI; shownI = hubI; swapT = t }
        val modes = listOf(
            "%02d:%02d".format(z.hour, z.minute) to (next?.let { clean(it.third) } ?: clean(FaceData.call).ifEmpty { "CLEAR" }),
            (FaceData.readiness.ifEmpty { "-" }) to clean(FaceData.call).ifEmpty { "READY · SD" },
            (FaceData.bedBy.ifEmpty { "-" }) to "BED BY",
            (FaceData.weather.ifEmpty { "-" }) to clean(FaceData.place).ifEmpty { "WEATHER" },
        )
        val q = smooth(clamp((t - swapT) / 380f)); val base = clamp(wake * 2); val activeW = 1 - e
        fun hubText(i: Int, w: Float) {
            if (w < .01f) return; val (big, small) = modes[i]
            micro(clean(big), C, C - 13, 3.4f).forEach { dot(canvas, it[0], it[1], 1.15f, .97f * w * mix(1f, .56f, e)) }
            micro(short(small), C, C + 9, 2.7f).forEach { dot(canvas, it[0], it[1], .92f, .82f * w * mix(1f, .5f, e)) }
        }
        hubText(shownI, base * (if (shownI == 0) 1f else activeW) * q)
        if (q < 1) hubText(prevI, base * (if (prevI == 0) 1f else activeW) * (1 - q))
        if (shownI != 0) hubText(0, base * e)
        for (i in 0 until 4) dot(canvas, C - 9 + i * 6, C + 32, if (i == shownI) 1.05f else .7f, (if (i == shownI) .65f else .2f) * base * (1 - e))
        canvas.restore()
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: SharedAssets) {}

    override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
        if (tapType != TapType.UP) return
        val w = screenBounds.width().toFloat(); val x = (tapEvent.xPos - screenBounds.left) / w * 480; val y = (tapEvent.yPos - screenBounds.top) / screenBounds.height().toFloat() * 480
        if (hypot(x - C, y - C) < 90) { hubI = (hubI + 1) % 4; invalidate() }
    }

    // gravity → tilt, only while the face is active (and visible)
    private fun setSensor(on: Boolean) {
        if (on == sensorOn) return; sensorOn = on
        val s = sensors?.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: return
        if (on) sensors.registerListener(this, s, SensorManager.SENSOR_DELAY_UI) else sensors.unregisterListener(this)
    }
    override fun onSensorChanged(event: SensorEvent) {
        val gx = event.values[0] / 9.81f; val gy = event.values[1] / 9.81f
        wantX = clamp(-gx / .55f, -1f, 1f); wantY = clamp((gy - .25f) / .55f, -1f, 1f); lastInput = SystemClock.uptimeMillis()
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    override fun onDestroy() { setSensor(false); super.onDestroy() }
}
