package cm.sabitori.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;
import java.io.File;

/** Small things Capacitor has no plugin for: open this app's system settings, clean up shared files, report filtered shares, and read one SMS the person allows. */
@CapacitorPlugin(name = "SabiToriNative")
public class SabiToriNativePlugin extends Plugin {

    private static int shareTooBig = 0;
    private static int shareNotImage = 0;
    private static int shareMore = 0;

    /** Set by MainActivity.filterShare for the share it just handed on. */
    static synchronized void setShareNotes(int tooBig, int notImage, int more) {
        shareTooBig = tooBig;
        shareNotImage = notImage;
        shareMore = more;
    }

    /** What the activity left out of the last share, then forgets it. */
    @PluginMethod
    public void takeShareNotes(PluginCall call) {
        JSObject r = new JSObject();
        synchronized (SabiToriNativePlugin.class) {
            r.put("tooBig", shareTooBig);
            r.put("notImage", shareNotImage);
            r.put("more", shareMore);
            shareTooBig = 0;
            shareNotImage = 0;
            shareMore = 0;
        }
        call.resolve(r);
    }

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

    // --- One SMS, with the person's consent ---------------------------------------------------------------------
    // Android's SMS User Consent API: after waitForSms, Google Play services watches for the next incoming SMS for
    // up to five minutes and then asks the person, in its own sheet, whether SabiTori may read that one message.
    // No SMS permission is requested and the inbox is never read. Play services only offers a message that holds a
    // 4 to 10 character code with at least one digit (a bill or mobile money SMS does) from a sender who is not a
    // saved contact. The text is handed to the web layer and stays on the phone.

    private BroadcastReceiver smsReceiver;
    private String smsCallId;

    @PluginMethod
    public void waitForSms(PluginCall call) {
        stopSmsWait("replaced");
        call.setKeepAlive(true);
        getBridge().saveCall(call);
        smsCallId = call.getCallbackId();
        try {
            SmsRetriever.getClient(getContext())
                .startSmsUserConsent(null)
                .addOnSuccessListener(unused -> listenForSms())
                .addOnFailureListener(e -> finishSms(null, "unavailable"));
        } catch (Exception e) {
            finishSms(null, "unavailable");
        }
    }

    @PluginMethod
    public void cancelSms(PluginCall call) {
        stopSmsWait("cancelled");
        call.resolve();
    }

    private void listenForSms() {
        if (smsCallId == null) return;
        smsReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (!SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) return;
                    Bundle extras = intent.getExtras();
                    Status status = extras == null ? null : (Status) extras.get(SmsRetriever.EXTRA_STATUS);
                    if (status == null) return;
                    if (status.getStatusCode() == CommonStatusCodes.TIMEOUT) {
                        finishSms(null, "timeout");
                        return;
                    }
                    if (status.getStatusCode() != CommonStatusCodes.SUCCESS) {
                        finishSms(null, "unavailable");
                        return;
                    }
                    Intent consent = (Intent) extras.get(SmsRetriever.EXTRA_CONSENT_INTENT);
                    PluginCall saved = smsCallId == null ? null : getBridge().getSavedCall(smsCallId);
                    // Only ever open Google Play services' own consent sheet, never an intent from another app.
                    ComponentName target = consent == null ? null : consent.resolveActivity(context.getPackageManager());
                    if (saved == null || target == null || !"com.google.android.gms".equals(target.getPackageName())) {
                        finishSms(null, "unavailable");
                        return;
                    }
                    unregisterSmsReceiver();
                    try {
                        startActivityForResult(saved, consent, "smsConsentResult");
                    } catch (Exception e) {
                        finishSms(null, "unavailable");
                    }
                }
            };
        ContextCompat.registerReceiver(
            getContext(),
            smsReceiver,
            new IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION),
            SmsRetriever.SEND_PERMISSION,
            null,
            ContextCompat.RECEIVER_EXPORTED
        );
    }

    @ActivityCallback
    private void smsConsentResult(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        String text = result.getResultCode() == Activity.RESULT_OK && data != null ? data.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE) : null;
        if (text == null || text.trim().isEmpty()) finishSms(null, "denied");
        else finishSms(text, null);
    }

    /** Answers the waiting call once: with the message, or with why there is none. */
    private void finishSms(String text, String reason) {
        unregisterSmsReceiver();
        String id = smsCallId;
        smsCallId = null;
        if (id == null) return;
        PluginCall call = getBridge().getSavedCall(id);
        if (call == null) return;
        JSObject r = new JSObject();
        if (text != null) r.put("text", text);
        else r.put("reason", reason);
        call.resolve(r);
        call.release(getBridge());
    }

    private void stopSmsWait(String reason) {
        if (smsCallId != null) finishSms(null, reason);
        else unregisterSmsReceiver();
    }

    private void unregisterSmsReceiver() {
        if (smsReceiver == null) return;
        try {
            getContext().unregisterReceiver(smsReceiver);
        } catch (Exception ignored) {
            // already unregistered
        }
        smsReceiver = null;
    }

    @Override
    protected void handleOnDestroy() {
        unregisterSmsReceiver();
        super.handleOnDestroy();
    }
}
