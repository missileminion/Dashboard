package io.github.missileminion.dashboard

import android.content.Context
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.VibrationEffect.Composition as P
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants as H
import android.view.View

// The app's haptic language. One word per kind of moment, each with its own feel, built from the vibration motor's primitives
// (the short, precisely shaped pulses the S24's motor is tuned for), so they are clearly different from each other. Played as
// touch feedback, so the phone's "vibration intensity → touch interactions" setting scales them, and "off" turns them off.
//
//   press    a button: a crisp click with a soft tail, like a key going down and coming back
//   select   picking one of several (a segment, a chip, a tab): one light, dry tick
//   minor    a small mark on a scale (quarters): the faintest low tick
//   major    a big mark on a scale (whole numbers): a firm click, clearly heavier than minor
//   limit    the end of a scale or range: a dull low bump, "nothing further"
//   toggle   something switching on or off (done, a setting): a short rise into a click
//   hold     a long press registering: a rise then a tick
//   confirm  something saved or logged: two clicks, the second stronger ("da-DUM")
//   reject   refused, or a first tap that arms a delete: two soft thuds, falling
//
// Phones without primitive support get the closest predefined effect; failing that, the system's own feedback constants.
object Haptics {
    private data class Step(val p: Int, val scale: Float, val delayMs: Int = 0)
    private fun vib(ctx: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator else @Suppress("DEPRECATION") ctx.getSystemService(Vibrator::class.java)

    private fun recipe(kind: String): List<Step> = when (kind) {
        "minor" -> listOf(Step(P.PRIMITIVE_LOW_TICK, .55f))
        "major" -> listOf(Step(P.PRIMITIVE_CLICK, .9f))
        "select" -> listOf(Step(P.PRIMITIVE_TICK, .75f))
        "limit" -> listOf(Step(P.PRIMITIVE_LOW_TICK, 1f), Step(P.PRIMITIVE_LOW_TICK, .6f, 40))
        "toggle" -> listOf(Step(P.PRIMITIVE_QUICK_RISE, .45f), Step(P.PRIMITIVE_CLICK, .7f, 10))
        "hold" -> listOf(Step(P.PRIMITIVE_QUICK_RISE, .7f), Step(P.PRIMITIVE_TICK, .9f))
        "confirm" -> listOf(Step(P.PRIMITIVE_CLICK, .55f), Step(P.PRIMITIVE_CLICK, 1f, 80))
        "reject" -> if (Build.VERSION.SDK_INT >= 31) listOf(Step(P.PRIMITIVE_THUD, .8f), Step(P.PRIMITIVE_THUD, .45f, 90)) else listOf(Step(P.PRIMITIVE_TICK, 1f), Step(P.PRIMITIVE_TICK, .6f, 90))
        else -> listOf(Step(P.PRIMITIVE_CLICK, .6f), Step(P.PRIMITIVE_TICK, .28f, 28))   // press (and the old "tap")
    }
    private fun predefined(kind: String) = when (kind) {
        "minor", "select" -> VibrationEffect.EFFECT_TICK
        "major", "press", "tap", "toggle", "hold" -> VibrationEffect.EFFECT_CLICK
        "confirm" -> VibrationEffect.EFFECT_DOUBLE_CLICK
        else -> VibrationEffect.EFFECT_HEAVY_CLICK
    }
    private fun constant(kind: String): Int { val u = Build.VERSION.SDK_INT >= 34
        return when (kind) { "minor" -> if (u) H.SEGMENT_FREQUENT_TICK else H.CLOCK_TICK; "major" -> if (u) H.SEGMENT_TICK else H.CONTEXT_CLICK
            "toggle" -> if (u) H.TOGGLE_ON else H.CONTEXT_CLICK; "confirm" -> H.CONFIRM; "reject" -> H.REJECT; "hold" -> H.LONG_PRESS; else -> H.KEYBOARD_TAP } }

    private var support: Boolean? = null
    fun play(ctx: Context, view: View, kind: String) {
        val v = vib(ctx)
        val effect: VibrationEffect? = try {
            if (v == null || !v.hasVibrator()) null
            else {
                val steps = recipe(kind)
                val ok = support ?: v.areAllPrimitivesSupported(P.PRIMITIVE_CLICK, P.PRIMITIVE_TICK, P.PRIMITIVE_LOW_TICK, P.PRIMITIVE_QUICK_RISE).also { support = it }
                if (ok && v.areAllPrimitivesSupported(*steps.map { it.p }.toIntArray())) VibrationEffect.startComposition().apply { steps.forEach { addPrimitive(it.p, it.scale, it.delayMs) } }.compose()
                else VibrationEffect.createPredefined(predefined(kind))
            }
        } catch (e: Exception) { null }
        if (effect == null) { view.performHapticFeedback(constant(kind)); return }
        if (Build.VERSION.SDK_INT >= 33) v!!.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
        else @Suppress("DEPRECATION") v!!.vibrate(effect)
    }
}
