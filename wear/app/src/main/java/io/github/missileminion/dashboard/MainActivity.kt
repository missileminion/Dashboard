package io.github.missileminion.dashboard

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.view.HapticFeedbackConstants as H
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.AutoCenteringParams
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.foundation.pager.HorizontalPager
import androidx.wear.compose.foundation.pager.rememberPagerState
import androidx.wear.compose.material3.HorizontalPageIndicator
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.util.Locale
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.round
import kotlin.math.sign
import kotlin.math.sin

// Galaxy Watch app. Full-screen cards, swiped sideways: Run, Legs, Push, Pull (it opens on today's: Wednesday is the run day).
// A day card scrolls down (bezel or finger) into its exercises; tap one for the weight, turn the bezel to set it (a tick per
// marker: whole numbers firm, quarters light), tap the number to log the set. Tap reps or sets to give the bezel to them.
// The Run card starts a tracked run: time, heart rate and zone, distance, pace, calories. Nothing-style: black, white, grey, dot matrix.
private val BG = Color(0xFF000000); private val TX = Color(0xFFF2F3F5); private val TX2 = Color(0xFFA3A8B2); private val TX3 = Color(0xFF6B707A); private val LINE = Color(0xFF26282E); private val PANEL = Color(0xFF111216)
private val MONO = FontFamily.Monospace

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.init(this); Run.init(this)
        setContent { MaterialTheme { App() } }
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
private fun clock(sec: Long) = if (sec >= 3600) "%d:%02d:%02d".format(sec / 3600, sec / 60 % 60, sec % 60) else "%d:%02d".format(sec / 60, sec % 60)

// What the weight screen is set to. Lives for the activity, so leaving and coming back keeps it.
class LogState {
    var day by mutableStateOf("")
    var ex by mutableStateOf("")
    var weightLb by mutableStateOf(45.0)
    var reps by mutableStateOf(8)
    var sets by mutableStateOf(3)
    var focus by mutableStateOf(0)   // what the bezel moves: 0 weight, 1 reps, 2 sets
    fun pick(d: String, name: String) {
        day = d; ex = name; focus = 0
        Store.lastOf(name)?.let { weightLb = it.weight; reps = it.reps.takeIf { r -> r > 0 } ?: reps; sets = it.sets.coerceAtLeast(1) }
    }
}

// the cards, in your order; any other day the phone sends goes after them
private fun days(): List<String> = listOf("Legs", "Push", "Pull").filter { it in Store.program } + Store.program.keys.filter { it !in listOf("Legs", "Push", "Pull") }
private fun todayPage(): Int { val w = Store.week[LocalDate.now().dayOfWeek.value % 7] ?: return 0; return days().indexOf(w).let { if (it < 0) 0 else it + 1 } }

@Composable
fun App() {
    val nav = rememberSwipeDismissableNavController()
    val st = remember { LogState() }
    Box(Modifier.fillMaxSize().background(BG)) {
        SwipeDismissableNavHost(navController = nav, startDestination = "home") {
            composable("home") { Home(onExercise = { d, n -> st.pick(d, n); nav.navigate("weight") }, onToday = { nav.navigate("today") }) }
            composable("weight") { WeightScreen(st) }
            composable("today") { TodayScreen() }
        }
    }
}

// ---------- the cards ----------
@Composable
fun Home(onExercise: (String, String) -> Unit, onToday: () -> Unit) {
    val ds = days()
    val pager = rememberPagerState(initialPage = todayPage()) { ds.size + 1 }
    Box(Modifier.fillMaxSize()) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            if (page == 0) RunCard() else DayCard(ds[page - 1], onExercise, onToday)
        }
        HorizontalPageIndicator(pagerState = pager, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DayCard(day: String, onExercise: (String, String) -> Unit, onToday: () -> Unit) {
    val view = LocalView.current
    val screen = LocalConfiguration.current.screenHeightDp
    val list = Store.program[day].orEmpty()
    val todays = Store.todays()
    val doneToday = todays.filter { it.day == day || list.any { (n) -> n == it.exercise } }
    val doneNames = doneToday.map { it.exercise }.toSet()
    ScalingLazyColumn(Modifier.fillMaxSize(), state = rememberScalingLazyListState(initialCenterItemIndex = 0), autoCentering = AutoCenteringParams(itemIndex = 0),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 24.dp)) {
        // the card itself: fills the screen; scroll down for its exercises
        item {
            Column(Modifier.fillMaxWidth().height((screen - 30).dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                DotText(day.uppercase(), 34.dp, TX)
                Spacer(Modifier.height(12.dp))
                BasicText("${list.size} exercises", style = TextStyle(color = TX2, fontSize = 12.sp, fontFamily = MONO))
                Spacer(Modifier.height(4.dp))
                BasicText(if (doneToday.isEmpty()) "nothing logged today" else "${doneToday.size} ${if (doneToday.size == 1) "set" else "sets"} today  ›", Modifier.clip(RoundedCornerShape(8.dp))
                    .combinedClickable(enabled = doneToday.isNotEmpty(), onClick = { view.hap(Hap.TAP); onToday() }).padding(horizontal = 6.dp, vertical = 2.dp),
                    style = TextStyle(color = if (doneToday.isEmpty()) TX3 else TX, fontSize = 12.sp, fontFamily = MONO))
                Spacer(Modifier.height(18.dp))
                BasicText("⌄", style = TextStyle(color = TX3, fontSize = 16.sp))
            }
        }
        items(list) { (name, target) ->
            val last = Store.lastOf(name)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(PANEL).combinedClickable(onClick = { view.hap(Hap.TAP); onExercise(day, name) }).padding(horizontal = 14.dp, vertical = 9.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BasicText(name, Modifier.weight(1f), style = TextStyle(color = TX, fontSize = 13.sp, fontWeight = FontWeight.SemiBold), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (name in doneNames) Box(Modifier.padding(start = 6.dp).size(6.dp).clip(CircleShape).background(TX))
                }
                BasicText(target + (last?.let { " · ${fmt(Store.toDisp(it.weight))} ${Store.unit}" } ?: ""), style = TextStyle(color = TX3, fontSize = 10.5.sp, fontFamily = MONO), maxLines = 1)
            }
        }
    }
}

// ---------- run ----------
// heart rate: Wear OS 6 (API 36, the Galaxy Watch 8) uses the health permission; older watches the body-sensor one
private val HR_PERM = if (Build.VERSION.SDK_INT >= 36) "android.permission.health.READ_HEART_RATE" else Manifest.permission.BODY_SENSORS
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RunCard() {
    val view = LocalView.current
    val screen = LocalConfiguration.current.screenHeightDp
    val perms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { got ->
        if (got[HR_PERM] == true) { view.hap(Hap.CONFIRM); Run.start() } else { Run.error = "Allow heart rate to start a run"; view.hap(Hap.REJECT) }
    }
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Run.state) { while (Run.state == Run.S.ACTIVE) { now = Instant.now(); delay(1000) } }
    var armEnd by remember { mutableStateOf(false) }
    LaunchedEffect(armEnd) { if (armEnd) { delay(3000); armEnd = false } }
    val running = Run.state == Run.S.ACTIVE || Run.state == Run.S.PAUSED || Run.state == Run.S.STARTING

    ScalingLazyColumn(Modifier.fillMaxSize(), state = rememberScalingLazyListState(initialCenterItemIndex = 0), autoCentering = AutoCenteringParams(itemIndex = 0),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 24.dp)) {
        item {
            Column(Modifier.fillMaxWidth().height((screen - 30).dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                when {
                    running -> {   // live: time, heart rate (zone as dots), distance and pace, calories
                        val sec = Run.activeSeconds(now)
                        BasicText(if (Run.state == Run.S.PAUSED) "PAUSED" else if (Run.state == Run.S.STARTING) "STARTING" else "RUN", style = TextStyle(color = if (Run.state == Run.S.PAUSED) TX else TX3, fontSize = 10.sp, fontFamily = MONO, letterSpacing = 2.sp))
                        Spacer(Modifier.height(4.dp))
                        DotText(clock(sec), 26.dp, TX)
                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            DotText(Run.hr?.let { "%.0f".format(it) } ?: "—", 20.dp, TX)
                            Spacer(Modifier.width(5.dp))
                            BasicText("bpm", Modifier.padding(bottom = 1.dp), style = TextStyle(color = TX3, fontSize = 10.sp, fontFamily = MONO))
                        }
                        Spacer(Modifier.height(5.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { val z = Run.zone(Run.hr); for (i in 1..5) Box(Modifier.size(width = 14.dp, height = 4.dp).clip(RoundedCornerShape(2.dp)).background(if (i <= z) TX else LINE)) }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            Stat("%.2f".format(Run.distanceM / 1000), "km")
                            Stat(Run.paceSecPerKm()?.let { clock(it) } ?: "—", "/km")
                            Stat("%.0f".format(Run.calories), "kcal")
                        }
                    }
                    Run.state == Run.S.ENDED -> {   // the summary
                        BasicText("DONE", style = TextStyle(color = TX3, fontSize = 10.sp, fontFamily = MONO, letterSpacing = 2.sp))
                        Spacer(Modifier.height(6.dp))
                        DotText("%.2f".format(Run.distanceM / 1000), 26.dp, TX)
                        BasicText("km", style = TextStyle(color = TX3, fontSize = 10.sp, fontFamily = MONO))
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            Stat(clock(Run.activeSeconds()), "time")
                            Stat(Run.hrAvg?.let { "%.0f".format(it) } ?: "—", "avg bpm")
                            Stat("%.0f".format(Run.calories), "kcal")
                        }
                    }
                    else -> {
                        DotText("RUN", 34.dp, TX)
                        Spacer(Modifier.height(10.dp))
                        BasicText("heart rate · pace · GPS", style = TextStyle(color = TX3, fontSize = 11.sp, fontFamily = MONO))
                        Spacer(Modifier.height(16.dp))
                        Box(Modifier.size(64.dp).clip(CircleShape).background(TX).combinedClickable(onClick = {
                            view.hap(Hap.TAP)
                            perms.launch(arrayOf(HR_PERM, Manifest.permission.ACTIVITY_RECOGNITION, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                        }), contentAlignment = Alignment.Center) {
                            BasicText("START", style = TextStyle(color = BG, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = MONO, letterSpacing = 1.sp))
                        }
                        Run.error?.let { Spacer(Modifier.height(8.dp)); BasicText(it, style = TextStyle(color = TX2, fontSize = 10.sp, textAlign = TextAlign.Center)) }
                    }
                }
                if (running || Run.state == Run.S.ENDED) { Spacer(Modifier.height(14.dp)); BasicText("⌄", style = TextStyle(color = TX3, fontSize = 16.sp)) }
            }
        }
        if (running) {
            item { Pill(if (Run.state == Run.S.PAUSED) "Resume" else "Pause", filled = true) { view.hap(Hap.TOGGLE); if (Run.state == Run.S.PAUSED) Run.resume() else Run.pause() } }
            item { Pill(if (armEnd) "Tap again to end" else "End run", filled = false) { if (armEnd) { armEnd = false; view.hap(Hap.CONFIRM); Run.end() } else { armEnd = true; view.hap(Hap.REJECT) } } }
        }
        if (Run.state == Run.S.ENDED) item { Pill("Done", filled = true) { view.hap(Hap.TAP); Run.reset() } }
    }
}

@Composable
private fun Stat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        BasicText(value, style = TextStyle(color = TX, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, fontFamily = MONO))
        BasicText(label, style = TextStyle(color = TX3, fontSize = 9.5.sp, fontFamily = MONO))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Pill(text: String, filled: Boolean, onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(23.dp)).background(if (filled) TX else PANEL).border(1.dp, if (filled) TX else LINE, RoundedCornerShape(23.dp))
        .combinedClickable(onClick = onClick), contentAlignment = Alignment.Center) {
        BasicText(text, style = TextStyle(color = if (filled) BG else TX, fontSize = 13.sp, fontWeight = FontWeight.SemiBold))
    }
}

// ---------- the weight: bezel sets it, tap the number to log ----------
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun WeightScreen(st: LogState) {
    val view = LocalView.current
    val fr = remember { FocusRequester() }
    var acc by remember { mutableFloatStateOf(0f) }
    var logged by remember { mutableIntStateOf(0) }          // bumps on every log: shows the confirmation for a moment
    var showLogged by remember { mutableStateOf(false) }
    val disp = Store.toDisp(st.weightLb)
    val maxDisp = Store.toDisp(600.0)
    val shown by animateFloatAsState(disp.toFloat(), spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = 900f), label = "ruler")
    val pulse by animateFloatAsState(if (showLogged) .35f else 1f, spring(stiffness = 600f), label = "pulse")
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
    LaunchedEffect(logged) { if (logged > 0) { showLogged = true; delay(1400); showLogged = false } }

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
        Column(Modifier.fillMaxSize().padding(top = d(32f)), horizontalAlignment = Alignment.CenterHorizontally) {
            BasicText(st.ex, Modifier.width(d(128f)), style = TextStyle(color = TX, fontSize = (13 * u).sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center), maxLines = 1, overflow = TextOverflow.Ellipsis)
            BasicText(last?.let { "last ${fmt(Store.toDisp(it.weight))}×${it.reps} · ${if (it.date == Store.today()) "today" else it.date.substring(5).replace('-', '/')}" } ?: "first time",
                style = TextStyle(color = TX3, fontSize = (10.5f * u).sp, fontFamily = MONO), maxLines = 1)
            Spacer(Modifier.height(d(6f)))
            // the number: tap logs the set, hold changes the step (.25 / 1 / 5)
            Box(Modifier.clip(RoundedCornerShape(14.dp)).combinedClickable(
                onClick = {
                    if (st.ex.isEmpty()) { view.hap(Hap.REJECT); return@combinedClickable }
                    Store.log(st.day, st.ex, st.weightLb, st.reps, st.sets); st.focus = 0; logged++; view.hap(Hap.CONFIRM)
                },
                onLongClick = { Store.step = when (Store.step) { 0.25 -> 1.0; 1.0 -> 5.0; else -> 0.25 }; Store.saveStep(); view.hap(Hap.TOGGLE) }
            ).padding(horizontal = d(8f), vertical = d(4f)).alpha(pulse), contentAlignment = Alignment.Center) {
                DotText(fmt(disp), d(fit(fmt(disp), 40f, 132f)), if (st.focus == 0) TX else TX2)   // long weights (152.75) shrink to stay inside the circle
            }
            BasicText(if (showLogged) "logged · set ${exToday}" else "${Store.unit} · ±${fmt(Store.step)} · tap to log",
                style = TextStyle(color = if (showLogged) TX else TX3, fontSize = (10f * u).sp, fontFamily = MONO))
        }
        Row(Modifier.align(Alignment.BottomCenter).padding(bottom = d(22f)), horizontalArrangement = Arrangement.spacedBy(d(6f))) {
            Chip("${st.reps}", "reps", st.focus == 1, u) { st.focus = if (st.focus == 1) 0 else 1; view.hap(Hap.TOGGLE) }
            Chip("${st.sets}", "sets", st.focus == 2, u) { st.focus = if (st.focus == 2) 0 else 2; view.hap(Hap.TOGGLE) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Chip(value: String, label: String, on: Boolean, u: Float, onClick: () -> Unit) {
    Row(Modifier.clip(RoundedCornerShape(16.dp)).background(PANEL).border(1.dp, if (on) TX else LINE, RoundedCornerShape(16.dp))
        .combinedClickable(onClick = onClick).padding(horizontal = (11 * u).dp, vertical = (6 * u).dp), verticalAlignment = Alignment.Bottom) {
        BasicText(value, style = TextStyle(color = TX, fontSize = (15 * u).sp, fontWeight = FontWeight.SemiBold, fontFamily = MONO))
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

// ---------- 5×7 dot-matrix face, the same glyphs as the phone (app/js/dotfont.js) ----------
// the height that keeps a dot-matrix string within maxW (both in layout units)
private fun fit(text: String, h: Float, maxW: Float): Float { val cols = text.sumOf { (GLYPH[it]?.get(0)?.length ?: 3) + 1 } - 1; return minOf(h, maxW / cols * 7f) }
private val GLYPH = mapOf(
    '0' to listOf(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."), '1' to listOf("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),
    '2' to listOf(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"), '3' to listOf("#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."),
    '4' to listOf("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."), '5' to listOf("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
    '6' to listOf("..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."), '7' to listOf("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
    '8' to listOf(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."), '9' to listOf(".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."),
    '.' to listOf(".", ".", ".", ".", ".", ".", "#"), ':' to listOf(".", ".", "#", ".", "#", ".", "."), '—' to listOf("....", "....", "....", "####", "....", "....", "...."),
    'A' to listOf(".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"), 'E' to listOf("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
    'G' to listOf(".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."), 'H' to listOf("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    'L' to listOf("#....", "#....", "#....", "#....", "#....", "#....", "#####"), 'N' to listOf("#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"),
    'O' to listOf(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."), 'P' to listOf("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
    'R' to listOf("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"), 'S' to listOf(".####", "#....", "#....", ".###.", "....#", "....#", "####."),
    'U' to listOf("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."), 'K' to listOf("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
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
