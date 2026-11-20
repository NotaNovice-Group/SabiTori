package cm.sabitori.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {

    /** Largest shared picture SabiTori accepts. A phone photo is 2 to 8 MB; anything bigger is not a photo of a message. */
    static final long MAX_SHARE_BYTES = 25L * 1024 * 1024;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SabiToriNativePlugin.class);
        registerPlugin(SabiToriKokoroPlugin.class);
        super.onCreate(savedInstanceState);
        // Capacitor only forwards *new* intents to plugins. A share (or a tapped reminder) that
        // *started* the app arrives as the launch intent, so hand it over once. Plugins keep the event
        // until the web page registers its listener, so nothing is lost on a slow cold start.
        if (savedInstanceState == null && getBridge() != null) {
            Intent launch = getIntent();
            boolean fromHistory = launch != null && (launch.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
            if (launch != null && !fromHistory) {
                getBridge().onNewIntent(filterShare(launch));
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(filterShare(intent));
    }

    /**
     * The share plugin copies every shared file into the app's cache, on the main thread, with no size
     * limit. Before it sees the intent, keep only the first picture, and only when it is under
     * MAX_SHARE_BYTES; files that are not pictures are dropped too. What was left out is counted, so the
     * page can say why (SabiToriNativePlugin.takeShareNotes). Only cheap metadata queries run here.
     */
    Intent filterShare(Intent in) {
        if (in == null) return null;
        String action = in.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return in;
        ArrayList<Uri> uris = new ArrayList<>();
        try {
            if (Intent.ACTION_SEND.equals(action)) {
                Uri u = streamOf(in);
                if (u != null) uris.add(u);
            } else {
                ArrayList<Uri> list = streamsOf(in);
                if (list != null) uris.addAll(list);
            }
        } catch (Exception e) {
            uris.clear();
        }
        if (uris.isEmpty()) return in;
        int tooBig = 0;
        int notImage = 0;
        int more = 0;
        Uri keep = null;
        for (Uri u : uris) {
            String type = typeOf(u);
            if (type == null || !type.toLowerCase().startsWith("image/")) {
                notImage++;
                continue;
            }
            long size = sizeOf(u);
            if (size > MAX_SHARE_BYTES) {
                tooBig++;
                continue;
            }
            if (keep == null) keep = u;
            else more++;
        }
        SabiToriNativePlugin.setShareNotes(tooBig, notImage, more);
        Intent out = new Intent(in);
        out.removeExtra(Intent.EXTRA_STREAM);
        if (keep != null) {
            if (Intent.ACTION_SEND.equals(action)) {
                out.putExtra(Intent.EXTRA_STREAM, keep);
            } else {
                ArrayList<Uri> one = new ArrayList<>();
                one.add(keep);
                out.putParcelableArrayListExtra(Intent.EXTRA_STREAM, one);
            }
        }
        return out;
    }

    @SuppressWarnings("deprecation")
    private static Uri streamOf(Intent in) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return in.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        return in.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    @SuppressWarnings("deprecation")
    private static ArrayList<Uri> streamsOf(Intent in) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return in.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
        return in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
    }

    private String typeOf(Uri u) {
        String type = null;
        try {
            type = getContentResolver().getType(u);
        } catch (Exception ignored) {
            // no type from the provider: guess from the name below
        }
        if (type == null) {
            String path = u.getLastPathSegment();
            int dot = path == null ? -1 : path.lastIndexOf('.');
            if (dot > 0) type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(path.substring(dot + 1).toLowerCase());
        }
        return type;
    }

    /** Size in bytes, or -1 when the provider does not say. */
    private long sizeOf(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.SIZE);
                if (i >= 0 && !c.isNull(i)) return c.getLong(i);
            }
        } catch (Exception ignored) {
            // fall through
        }
        try (android.content.res.AssetFileDescriptor fd = getContentResolver().openAssetFileDescriptor(u, "r")) {
            if (fd != null) return fd.getLength();
        } catch (Exception ignored) {
            // unknown
        }
        return -1;
    }
}
