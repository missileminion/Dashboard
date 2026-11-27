package io.github.missileminion.dashboard

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.em
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

// Two tiles (swipe sideways from the watch face), in the app's look: black, white, grey, big type, nothing near the rim.
//   Today: today's workout card in big letters, sets logged today and the last set. Tap: opens on that card.
//   Run:   a big Start; while a run is going, the live pace and time. Tap: opens on the Run card (Start also starts the run).
// They refresh when a set is logged or a run changes (Tiles.refresh), and every 30 min / every minute during a run otherwise.
private const val TX = 0xFFF2F3F5.toInt(); private const val TX2 = 0xFFA3A8B2.toInt(); private const val TX3 = 0xFF6B707A.toInt(); private const val BG = 0xFF000000.toInt()

object Tiles {
    fun refresh(ctx: Context) = runCatching {
        TileService.getUpdater(ctx).requestUpdate(TodayTile::class.java)
        TileService.getUpdater(ctx).requestUpdate(RunTile::class.java)
    }
    fun text(s: String, size: Float, color: Int, bold: Boolean = false, spacing: Float = 0f, maxLines: Int = 1): LayoutElement =
        Text.Builder().setText(s).setMaxLines(maxLines)
            .setFontStyle(FontStyle.Builder().setSize(sp(size)).setColor(argb(color)).setLetterSpacing(em(spacing))
                .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL).build()).build()
    fun gap(h: Float): LayoutElement = Spacer.Builder().setHeight(dp(h)).build()
    // opens the app on a page ("run" or "today"); start = also start the run
    fun open(ctx: Context, page: String, start: Boolean = false): ModifiersBuilders.Clickable =
        ModifiersBuilders.Clickable.Builder().setId("open-$page-$start").setOnClick(
            ActionBuilders.LaunchAction.Builder().setAndroidActivity(
                ActionBuilders.AndroidActivity.Builder().setPackageName(ctx.packageName).setClassName(MainActivity::class.java.name)
                    .addKeyToExtraMapping("page", ActionBuilders.AndroidStringExtra.Builder().setValue(page).build())
                    .addKeyToExtraMapping("start", ActionBuilders.AndroidBooleanExtra.Builder().setValue(start).build()).build()
            ).build()
        ).build()
    fun screen(content: LayoutElement, click: ModifiersBuilders.Clickable): LayoutElement =
        Box.Builder().setWidth(expand()).setHeight(expand())
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(click).setBackground(ModifiersBuilders.Background.Builder().setColor(argb(BG)).build()).build())
            .addContent(content).build()
    fun tile(root: LayoutElement, freshMs: Long): ListenableFuture<TileBuilders.Tile> = Futures.immediateFuture(
        TileBuilders.Tile.Builder().setResourcesVersion("1").setFreshnessIntervalMillis(freshMs)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root)).build())
    fun resources(): ListenableFuture<ResourceBuilders.Resources> = Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion("1").build())
}

// asked for by a tile, read by the app when it opens (also while it is already open)
object Launch { var req by mutableStateOf<Pair<String, Boolean>?>(null) }

class TodayTile : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        Store.init(this)
        val day = Store.week[java.time.LocalDate.now().dayOfWeek.value % 7]
        val list = day?.let { Store.program[it] }.orEmpty().map { it.first }
        val today = Store.todays().filter { day == null || it.day == day || it.exercise in list }
        val last = today.firstOrNull()
        val col = Column.Builder().setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(Tiles.text(if (day == null) "REST" else "TODAY", 10f, TX3, spacing = .2f))
            .addContent(Tiles.gap(4f))
            .addContent(Tiles.text(day?.uppercase() ?: "RUN DAY", 34f, TX, bold = true, spacing = .08f))
            .addContent(Tiles.gap(8f))
            .addContent(Tiles.text(if (today.isEmpty()) "nothing logged yet" else "${today.size} ${if (today.size == 1) "set" else "sets"} today", 13f, if (today.isEmpty()) TX3 else TX))
        if (last != null) col.addContent(Tiles.gap(4f)).addContent(Tiles.text("${last.exercise.substringBefore(" (").take(22)} · ${fmtW(Store.dispFor(last.exercise, last.weight))}×${last.reps}", 11f, TX2))
        return Tiles.tile(Tiles.screen(col.build(), Tiles.open(this, if (day == null) "run" else "today")), 30 * 60_000L)
    }
    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest) = Tiles.resources()
}

class RunTile : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        Store.init(this)
        val live = Run.state == Run.S.ACTIVE || Run.state == Run.S.PAUSED
        val col = Column.Builder().setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        if (live) {
            val sec = Run.activeSeconds()
            col.addContent(Tiles.text(if (Run.state == Run.S.PAUSED) "PAUSED" else "PACE", 10f, TX3, spacing = .2f))
                .addContent(Tiles.gap(4f))
                .addContent(Tiles.text(Run.paceSecPerKm()?.let { clock(it) } ?: "—", 34f, TX, bold = true))
                .addContent(Tiles.text("/km", 11f, TX3))
                .addContent(Tiles.gap(8f))
                .addContent(Tiles.text("${clock(sec)}  ·  ${"%.2f".format(Run.distanceM / 1000)} km", 13f, TX))
        } else {
            val lr = Store.lastRun
            col.addContent(Tiles.text("RUN", 30f, TX, bold = true, spacing = .1f))
                .addContent(Tiles.gap(10f))
                .addContent(Box.Builder().setWidth(dp(64f)).setHeight(dp(64f))
                    .setModifiers(ModifiersBuilders.Modifiers.Builder()
                        .setBackground(ModifiersBuilders.Background.Builder().setColor(argb(TX)).setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(32f)).build()).build())
                        .setClickable(Tiles.open(this, "run", start = true)).build())
                    .addContent(Tiles.text("START", 11f, BG, bold = true, spacing = .06f)).build())
            if (lr != null) col.addContent(Tiles.gap(10f)).addContent(Tiles.text("last  ${"%.2f".format(lr.km)} km · ${lr.pace?.let { clock(it) + "/km" } ?: clock(lr.sec)}", 11f, TX2))
        }
        return Tiles.tile(Tiles.screen(col.build(), Tiles.open(this, "run")), if (live) 60_000L else 30 * 60_000L)
    }
    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest) = Tiles.resources()
}

private fun clock(sec: Long) = if (sec >= 3600) "%d:%02d:%02d".format(sec / 3600, sec / 60 % 60, sec % 60) else "%d:%02d".format(sec / 60, sec % 60)
private fun fmtW(v: Double): String = if (kotlin.math.abs(v - kotlin.math.round(v)) < 1e-6) kotlin.math.round(v).toLong().toString() else "%.2f".format(java.util.Locale.US, v).trimEnd('0').trimEnd('.')
