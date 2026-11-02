package cm.sabitori.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SabiToriNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Capacitor only forwards *new* intents to plugins. A share (or a tapped reminder) that
        // *started* the app arrives as the launch intent, so hand it over once. Plugins keep the event
        // until the web page registers its listener, so nothing is lost on a slow cold start.
        if (savedInstanceState == null && getBridge() != null) {
            Intent launch = getIntent();
            boolean fromHistory = launch != null && (launch.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
            if (launch != null && !fromHistory) {
                getBridge().onNewIntent(launch);
            }
        }
    }
}
