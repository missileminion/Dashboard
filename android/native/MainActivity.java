package io.github.missileminion.dashboard;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

// The app is one web page (app/lite.html). This adds the Health Connect plugin and makes Back behave:
// close the "i" popover, then return to Today, then leave the app (the page decides through window.__back()).
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthConnectPlugin.class);
        super.onCreate(savedInstanceState);
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
