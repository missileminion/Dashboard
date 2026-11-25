package io.github.missileminion.dashboard

import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

// Health Connect requires a screen explaining how the app uses health data. It opens from Health Connect's permission screens.
class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val t = TextView(this).apply {
            setPadding(48, 96, 48, 48); textSize = 16f; setTextColor(0xFFEEF0F5.toInt()); setBackgroundColor(0xFF05060A.toInt())
            text = "Dashboard: how health data is used\n\n" +
                "This is a personal app with one user. It only reads Health Connect; it never writes to it.\n\n" +
                "What it reads: sleep, resting heart rate, heart rate, HRV, SpO2, breathing rate, skin temperature, VO2 max, exercise and distance.\n\n" +
                "Where it goes: the data is kept on this phone. If you connect your own private GitHub repository in the app, a compressed copy " +
                "is saved there so the web version of the dashboard can show the same numbers. Nothing is sent anywhere else. No ads, no analytics, no accounts.\n\n" +
                "You can remove access at any time in Health Connect."
        }
        setContentView(ScrollView(this).apply { setBackgroundColor(0xFF05060A.toInt()); addView(t) })
    }
}
