package cm.sabitori.app;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/** Two small things Capacitor has no plugin for: open this app's system settings, and clean up shared files. */
@CapacitorPlugin(name = "SabiToriNative")
public class SabiToriNativePlugin extends Plugin {

    @PluginMethod
    public void openSettings(PluginCall call) {
        String target = call.getString("target", "app");
        Intent intent;
        if ("notifications".equals(target)) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings", e);
        }
    }

    /** The share plugin copies a shared photo into the app's private cache. Once read, delete it. */
    @PluginMethod
    public void forgetSharedFiles(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), "shared_files");
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isFile()) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
        }
        call.resolve(new JSObject());
    }
}
