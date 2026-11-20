package cm.sabitori.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsManager;
import android.telephony.SmsMessage;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Arrays;

/**
 * Relay mode (docs/sms-ussd.md, route A): this phone answers SMS that people forward to it. Each SMS is handed to
 * the web page, which makes the card on this phone, offline, and the reply is sent back by SMS from this SIM.
 *
 * Only the "relay" build declares RECEIVE_SMS and SEND_SMS (src/relay/AndroidManifest.xml). In the store build the
 * permissions are not declared, so start() answers {available: false} and nothing here can run. Message texts are
 * passed to the page and never written anywhere.
 */
@CapacitorPlugin(
    name = "SmsRelay",
    permissions = { @Permission(alias = "sms", strings = { Manifest.permission.RECEIVE_SMS, Manifest.permission.SEND_SMS }) }
)
public class SmsRelayPlugin extends Plugin {

    private BroadcastReceiver receiver;

    private boolean declared() {
        try {
            Context ctx = getContext();
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), PackageManager.GET_PERMISSIONS);
            if (info.requestedPermissions == null) return false;
            return Arrays.asList(info.requestedPermissions).contains(Manifest.permission.RECEIVE_SMS)
                && Arrays.asList(info.requestedPermissions).contains(Manifest.permission.SEND_SMS);
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", declared());
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!declared()) {
            JSObject r = new JSObject();
            r.put("available", false);
            call.resolve(r);
            return;
        }
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermsDone");
            return;
        }
        listen(call);
    }

    @PermissionCallback
    private void smsPermsDone(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) listen(call);
        else {
            JSObject r = new JSObject();
            r.put("available", true);
            r.put("denied", true);
            call.resolve(r);
        }
    }

    private void listen(PluginCall call) {
        if (receiver == null) {
            receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
                    if (parts == null || parts.length == 0) return;
                    StringBuilder text = new StringBuilder();
                    String from = parts[0].getDisplayOriginatingAddress();
                    for (SmsMessage p : parts) if (p != null && p.getDisplayMessageBody() != null) text.append(p.getDisplayMessageBody());
                    JSObject ev = new JSObject();
                    ev.put("from", from == null ? "" : from);
                    ev.put("text", text.toString());
                    notifyListeners("sms", ev);
                }
            };
            IntentFilter filter = new IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION);
            if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
            else getContext().registerReceiver(receiver, filter);
        }
        // A relay phone is plugged in and left on: keep the screen (and so the app) awake while relaying.
        getActivity().runOnUiThread(() -> getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        JSObject r = new JSObject();
        r.put("available", true);
        r.put("running", true);
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {
                /* already gone */
            }
            receiver = null;
        }
        getActivity().runOnUiThread(() -> getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String to = call.getString("to");
        String text = call.getString("text");
        if (!declared() || getPermissionState("sms") != PermissionState.GRANTED || to == null || text == null) {
            call.reject("not allowed");
            return;
        }
        try {
            SmsManager sms = Build.VERSION.SDK_INT >= 31 ? getContext().getSystemService(SmsManager.class) : SmsManager.getDefault();
            ArrayList<String> parts = sms.divideMessage(text);
            sms.sendMultipartTextMessage(to, null, parts, null, null);
            JSObject r = new JSObject();
            r.put("parts", parts.size());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("send failed");
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {
                /* already gone */
            }
            receiver = null;
        }
    }
}
