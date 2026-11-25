package io.github.missileminion.dashboard;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

// The app is one web page (app/lite.html). This adds the Health Connect plugin and makes Back behave:
// close the "i" popover, then return to Today, then leave the app (the page decides through window.__back()).
// Edge to edge: the page draws behind the status bar and the gesture bar (no coloured bands); the bars' sizes are handed to the page
// as CSS variables (--ins-t, --ins-b), and kept in localStorage so the next start lays out right from the first frame.
public class MainActivity extends BridgeActivity {
    private int insT = 0, insB = 0;
    private void sendInsets() {
        WebView w = getBridge().getWebView();
        String js = "(function(t,b){var s=document.documentElement.style;s.setProperty('--ins-t',t+'px');s.setProperty('--ins-b',b+'px');try{localStorage.setItem('lite.insets',JSON.stringify([t,b]))}catch(e){}})(" + insT + "," + insB + ")";
        w.post(() -> w.evaluateJavascript(js, null));
    }
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthConnectPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) { getWindow().setNavigationBarContrastEnforced(false); getWindow().setStatusBarContrastEnforced(false); }
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!dark); bars.setAppearanceLightNavigationBars(!dark);
        WebView web = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, ins) -> {
            Insets i = ins.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float d = getResources().getDisplayMetrics().density;
            insT = Math.round(i.top / d); insB = Math.round(i.bottom / d); sendInsets();
            return WindowInsetsCompat.CONSUMED;   // the page pads itself; nothing else should add margins
        });
        web.postDelayed(this::sendInsets, 1200); web.postDelayed(this::sendInsets, 4000);   // again once the page has loaded
        getBridge().getWebView().setVerticalScrollBarEnabled(false);     // no scroll bars: the page scrolls without them
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript("(window.__back && window.__back()) ? 'y' : 'n'", r -> {
                    if (r == null || !r.contains("y")) { setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); setEnabled(true); }
                });
            }
        });
    }
}
