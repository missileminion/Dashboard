package io.github.missileminion.dashboard

import android.os.Build
import android.os.Bundle
import android.view.HapticFeedbackConstants as H
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import kotlinx.coroutines.delay
import java.util.Locale
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.round
import kotlin.math.sign
import kotlin.math.sin

// Galaxy Watch gym log. One screen does the work: turn the bezel to set the weight (a tick per marker: whole numbers firm,
// quarters light), tap reps or sets to give the bezel to them, tap LOG. Tap the exercise name to pick another; tap the line
// under it for today's sets (with undo). Nothing-style: black, white, grey, dot-matrix numbers.
private val BG = Color(0xFF000000); private val TX = Color(0xFFF2F3F5); private val TX2 = Color(0xFFA3A8B2); private val TX3 = Color(0xFF6B707A); private val LINE = Color(0xFF26282E); private val PANEL = Color(0xFF111216)
private val MONO = FontFamily.Monospace

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.init(this)
        setContent { App() }
    }
}

// ---- haptics: the watch's own patterns (follow its vibration settings) ----
enum class Hap { MINOR, MAJOR, TAP, TOGGLE, CONFIRM, REJECT }
fun View.hap(k: Hap) {
    val u = Build.VERSION.SDK_INT >= 34
    performHapticFeedback(when (k) {
        Hap.MINOR -> if (u) H.SEGMENT_FREQUENT_TICK else H.CLOCK_TICK
        Hap.MAJOR -> if (u) H.SEGMENT_TICK else H.CONTEXT_CLICK
        Hap.TAP -> H.KEYBOARD_TAP
        Hap.TOGGLE -> if (u) H.TOGGLE_ON else H.CONTEXT_CLICK
        Hap.CONFIRM -> H.CONFIRM
        Hap.REJECT -> H.REJECT
    })
}
private fun detent(v: Double) = if (abs(v - round(v)) < 1e-6) Hap.MAJOR else Hap.MINOR
private fun fmt(v: Double): String = if (abs(v - round(v)) < 1e-6) round(v).toLong().toString() else "%.2f".format(Locale.US, v).trimEnd('0').trimEnd('.')

// What the log screen is set to. Lives for the activity, so going to the exercise list and back keeps it.
class LogState {
    var day by mutableStateOf(Store.scheduled())
    var ex by mutableStateOf("")
    var weightLb by mutableStateOf(45.0)
    var reps by mutableStateOf(8)
    var sets by mutableStateOf(3)
    var focus by mutableStateOf(0)   // what the bezel moves: 0 weight, 1 reps, 2 sets
    fun pick(d: String, name: String) {
        day = d; ex = name; focus = 0
        Store.lastOf(name)?.let { weightLb = it.weight; reps = it.reps.takeIf { r -> r > 0 } ?: reps; sets = it.sets.coerceAtLeast(1) }
    }
    fun ensure() { val list = Store.program[day]?.map { it.first }.orEmpty(); if (ex !in list) list.firstOrNull()?.let { pick(day, it) } }
}

@Composable
fun App() {
    val nav = rememberSwipeDismissableNavController()
    val st = remember { LogState() }
    LaunchedEffect(Store.program) { st.ensure() }
    Box(Modifier.fillMaxSize().background(BG)) {
        SwipeDismissableNavHost(navController = nav, startDestination = "log") {
            composable("log") { LogScreen(st, onPick = { nav.navigate("ex") }, onToday = { nav.navigate("today") }) }
            composable("ex") { ExerciseScreen(st) { nav.popBackStack() } }
            composable("today") { TodayScreen() }
        }
    }
}

// ---------- the log screen ----------
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LogScreen(st: LogState, onPick: () -> Unit, onToday: () -> Unit) {
    val view = LocalView.current
    val fr = remember { FocusRequester() }
    var acc by remember { mutableFloatStateOf(0f) }
    var flash by remember { mutableStateOf(false) }
    val disp = Store.toDisp(st.weightLb)
    val maxDisp = Store.toDisp(600.0)
    val shown by animateFloatAsState(disp.toFloat(), spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = 900f), label = "ruler")
    val todayN = Store.todays().size
    val exToday = Store.todays().count { it.exercise == st.ex }
    val last = Store.lastOf(st.ex)

    fun turn(n: Int) {
        when (st.focus) {
            0 -> {
                val step = Store.step
                val v = (round((disp + n * step) / step) * step).coerceIn(0.0, maxDisp)
                if (v == disp) { view.hap(Hap.REJECT); return }
                st.weightLb = Store.toLb(v); view.hap(detent(v))
            }
            1 -> { val r = (st.reps + n).coerceIn(0, 100); if (r != st.reps) { st.reps = r; view.hap(Hap.MAJOR) } else view.hap(Hap.REJECT) }
            else -> { val s = (st.sets + n).coerceIn(1, 20); if (s != st.sets) { st.sets = s; view.hap(Hap.MAJOR) } else view.hap(Hap.REJECT) }
        }
    }
    LaunchedEffect(Unit) { fr.requestFocus() }
    LaunchedEffect(flash) { if (flash) { delay(1100); flash = false } }

    BoxWithConstraints(
        Modifier.fillMaxSize()
            .onRotaryScrollEvent { e ->   // the bezel: a physical or touch bezel sends one big step per click; a smooth crown sends small ones
                val px = e.verticalScrollPixels
                val n = if (abs(px) >= 30f) sign(px).toInt() else { acc += px; val k = (acc / 40f).toInt(); acc -= k * 40f; k }
                if (n != 0) turn(n); true
            }
            .focusRequester(fr).focusable()
    ) {
        val u = maxWidth.value / 192f   // layout unit: 1 on a 192dp screen, larger on the 44mm watch
        fun d(v: Float): Dp = (v * u).dp
        Ruler(shown.toDouble(), active = st.focus == 0)
        Column(Modifier.fillMaxSize().padding(top = d(30f)), horizontalAlignment = Alignment.CenterHorizontally) {
            // exercise (tap to change)
            BasicText(st.ex.ifEmpty { "Pick an exercise" } + "  ›", Modifier.width(d(132f)).clip(RoundedCornerShape(8.dp)).combinedClickable(onClick = { view.hap(Hap.TAP); onPick() }).padding(vertical = d(2f)),
                style = TextStyle(color = TX, fontSize = (13 * u).sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center), maxLines = 1, overflow = TextOverflow.Ellipsis)
            // today's count and the last set (tap for today's list)
            BasicText(buildString { append(if (todayN > 0) "$todayN today" else st.day); if (last != null) append(" · last ${fmt(Store.toDisp(last.weight))}×${last.reps}") },
                Modifier.clip(RoundedCornerShape(8.dp)).combinedClickable(onClick = { view.hap(Hap.TAP); onToday() }).padding(horizontal = d(6f), vertical = d(1f)),
                style = TextStyle(color = TX3, fontSize = (10.5f * u).sp, fontFamily = MONO), maxLines = 1)
            Spacer(Modifier.height(d(3f)))
            // the weight: tap gives the bezel back to it, hold to change the step (.25 / 1 / 5)
            Box(Modifier.clip(RoundedCornerShape(12.dp)).combinedClickable(
                onClick = { if (st.focus != 0) { st.focus = 0; view.hap(Hap.TOGGLE) } },
                onLongClick = { Store.step = when (Store.step) { 0.25 -> 1.0; 1.0 -> 5.0; else -> 0.25 }; Store.saveStep(); view.hap(Hap.TOGGLE) }
            ).padding(horizontal = d(8f), vertical = d(3f)), contentAlignment = Alignment.Center) {
                DotText(fmt(disp), d(fit(fmt(disp), 34f, 128f)), if (st.focus == 0) TX else TX2)   // long weights (152.75) shrink to stay inside the circle
            }
            BasicText("${Store.unit} · ±${fmt(Store.step)}${if (exToday > 0) " · set ${exToday + 1}" else ""}", style = TextStyle(color = TX3, fontSize = (10f * u).sp, fontFamily = MONO))
            Spacer(Modifier.height(d(6f)))
            Row(horizontalArrangement = Arrangement.spacedBy(d(6f))) {
                Chip("${st.reps}", "reps", st.focus == 1, u) { st.focus = if (st.focus == 1) 0 else 1; view.hap(Hap.TOGGLE) }
                Chip("${st.sets}", "sets", st.focus == 2, u) { st.focus = if (st.focus == 2) 0 else 2; view.hap(Hap.TOGGLE) }
            }
        }
        // LOG sits at the bottom, inside the round screen
        Box(Modifier.align(Alignment.BottomCenter).padding(bottom = d(9f)).width(d(78f)).height(d(30f)).clip(CircleShape).background(TX).combinedClickable(onClick = {
            if (st.ex.isEmpty()) { view.hap(Hap.REJECT); return@combinedClickable }
            Store.log(st.day, st.ex, st.weightLb, st.reps, st.sets); st.focus = 0; flash = true; view.hap(Hap.CONFIRM)
        }), contentAlignment = Alignment.Center) {
            BasicText("LOG", style = TextStyle(color = BG, fontSize = (13 * u).sp, fontWeight = FontWeight.Bold, fontFamily = MONO, letterSpacing = (1.5 * u).sp))
        }
        if (flash) Box(Modifier.fillMaxSize().background(BG), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                DotText("OK", d(30f), TX)
                Spacer(Modifier.height(d(8f)))
                BasicText("${fmt(disp)} ${Store.unit} × ${st.reps} × ${st.sets}", style = TextStyle(color = TX2, fontSize = (11 * u).sp, fontFamily = MONO))
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Chip(value: String, label: String, on: Boolean, u: Float, onClick: () -> Unit) {
    Row(Modifier.clip(RoundedCornerShape(14.dp)).background(PANEL).border(1.dp, if (on) TX else LINE, RoundedCornerShape(14.dp))
        .combinedClickable(onClick = onClick).padding(horizontal = (10 * u).dp, vertical = (4 * u).dp), verticalAlignment = Alignment.Bottom) {
        BasicText(value, style = TextStyle(color = TX, fontSize = (14 * u).sp, fontWeight = FontWeight.SemiBold, fontFamily = MONO))
        Spacer(Modifier.width((4 * u).dp))
        BasicText(label, Modifier.padding(bottom = (1.5f * u).dp), style = TextStyle(color = if (on) TX2 else TX3, fontSize = (10 * u).sp, fontFamily = MONO))
    }
}

// The scale around the top of the bezel, turning with the weight under a fixed pointer at 12 o'clock: a mark every quarter,
// whole numbers longer, every 5 longer still. It fades out towards both ends, like the phone's ruler.
@Composable
private fun Ruler(value: Double, active: Boolean) {
    Canvas(Modifier.fillMaxSize()) {
        val r = size.minDimension / 2f; val c = Offset(size.width / 2f, size.height / 2f)
        val degPerUnit = 12f; val span = 72f
        val lo = Math.floor((value - span / degPerUnit) * 4).toInt(); val hi = Math.ceil((value + span / degPerUnit) * 4).toInt()
        for (q in lo..hi) {
            val v = q / 4.0; if (v < 0) continue
            val a = ((v - value) * degPerUnit).toFloat(); if (abs(a) > span) continue
            val fade = 1f - (abs(a) / span).let { it * it }
            val whole = q % 4 == 0; val five = whole && (q / 4) % 5 == 0
            val len = r * when { five -> .11f; whole -> .075f; else -> .04f }
            val col = (if (whole) TX2 else TX3).copy(alpha = fade * (if (active) 1f else .55f))
            radial(c, r - r * .03f, len, a, col, if (whole) r * .012f else r * .008f)
        }
        radial(c, r - r * .015f, r * .15f, 0f, if (active) TX else TX2, r * .02f)   // the pointer
    }
}
private fun DrawScope.radial(c: Offset, outer: Float, len: Float, deg: Float, col: Color, w: Float) {
    val t = Math.toRadians((deg - 90).toDouble()); val dx = cos(t).toFloat(); val dy = sin(t).toFloat()
    drawLine(col, Offset(c.x + dx * outer, c.y + dy * outer), Offset(c.x + dx * (outer - len), c.y + dy * (outer - len)), strokeWidth = w, cap = StrokeCap.Round)
}

// the height that keeps a dot-matrix string within maxW (both in layout units)
private fun fit(text: String, h: Float, maxW: Float): Float { val cols = text.sumOf { (GLYPH[it]?.get(0)?.length ?: 3) + 1 } - 1; return minOf(h, maxW / cols * 7f) }

// 5×7 dot-matrix face, the same glyphs as the phone (app/js/dotfont.js)
private val GLYPH = mapOf(
    '0' to listOf(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."), '1' to listOf("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),
    '2' to listOf(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"), '3' to listOf("#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."),
    '4' to listOf("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."), '5' to listOf("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
    '6' to listOf("..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."), '7' to listOf("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
    '8' to listOf(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."), '9' to listOf(".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."),
    '.' to listOf(".", ".", ".", ".", ".", ".", "#"), 'O' to listOf(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."), 'K' to listOf("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
)
@Composable
fun DotText(text: String, height: Dp, color: Color) {
    val cols = text.sumOf { (GLYPH[it]?.get(0)?.length ?: 3) + 1 } - 1
    val gap = height / 7
    Canvas(Modifier.size(gap * cols, height)) {
        val g = size.height / 7f; val rad = g * .36f; var x0 = 0f
        for (ch in text) {
            val rows = GLYPH[ch] ?: List(7) { "..." }
            rows.forEachIndexed { y, row -> row.forEachIndexed { x, p -> if (p == '#') drawCircle(color, rad, Offset(x0 + x * g + g / 2, y * g + g / 2)) } }
            x0 += (rows[0].length + 1) * g
        }
    }
}

// ---------- pick an exercise ----------
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ExerciseScreen(st: LogState, done: () -> Unit) {
    val view = LocalView.current
    var day by remember { mutableStateOf(st.day) }
    val list = Store.program[day].orEmpty()
    val todays = Store.todays().map { it.exercise }.toSet()
    ScalingLazyColumn(Modifier.fillMaxSize(), state = rememberScalingLazyListState(initialCenterItemIndex = 1 + list.indexOfFirst { it.first == st.ex }.coerceAtLeast(0)) /* opens on the current exercise */, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 28.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Store.program.keys.forEach { k ->
                    val on = k == day
                    Box(Modifier.clip(RoundedCornerShape(12.dp)).background(if (on) TX else PANEL).combinedClickable(onClick = { day = k; view.hap(Hap.TOGGLE) }).padding(horizontal = 9.dp, vertical = 6.dp)) {
                        BasicText(k, style = TextStyle(color = if (on) BG else TX2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = MONO))
                    }
                }
            }
        }
        items(list) { (name, target) ->
            val last = Store.lastOf(name)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(PANEL).combinedClickable(onClick = { st.pick(day, name); view.hap(Hap.TAP); done() }).padding(horizontal = 14.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BasicText(name, Modifier.weight(1f), style = TextStyle(color = TX, fontSize = 13.sp, fontWeight = FontWeight.SemiBold), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (name in todays) Box(Modifier.padding(start = 6.dp).size(6.dp).clip(CircleShape).background(TX))
                }
                BasicText(target + (last?.let { " · ${fmt(Store.toDisp(it.weight))} ${Store.unit}" } ?: ""), style = TextStyle(color = TX3, fontSize = 10.5.sp, fontFamily = MONO), maxLines = 1)
            }
        }
    }
}

// ---------- today's sets, newest first; undo takes two taps ----------
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TodayScreen() {
    val view = LocalView.current
    var armed by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(armed) { if (armed != null) { delay(3000); armed = null } }
    val sets = Store.todays()
    ScalingLazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 28.dp)) {
        item { BasicText(if (sets.isEmpty()) "No sets today" else "Today · ${sets.size} ${if (sets.size == 1) "set" else "sets"}", style = TextStyle(color = TX2, fontSize = 12.sp, fontFamily = MONO)) }
        items(sets, key = { it.id }) { e ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(PANEL).padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    BasicText(e.exercise, style = TextStyle(color = TX, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    BasicText("${fmt(Store.toDisp(e.weight))} ${Store.unit} × ${e.reps} × ${e.sets}", style = TextStyle(color = TX3, fontSize = 10.5.sp, fontFamily = MONO))
                }
                val on = armed == e.id
                Box(Modifier.clip(RoundedCornerShape(12.dp)).background(if (on) TX else BG).combinedClickable(onClick = {
                    if (on) { Store.undo(e.id); armed = null; view.hap(Hap.CONFIRM) } else { armed = e.id; view.hap(Hap.REJECT) }
                }).padding(horizontal = 8.dp, vertical = 6.dp)) {
                    BasicText(if (on) "Undo?" else "Undo", style = TextStyle(color = if (on) BG else TX2, fontSize = 11.sp, fontFamily = MONO))
                }
            }
        }
    }
}

