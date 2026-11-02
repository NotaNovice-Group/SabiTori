# SabiTori release rules (R8). The web app does the real work; only the thin native shell is shrunk.

# Keep readable stack traces for crash reports from the Play Console.
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# Capacitor finds plugins by annotation and calls their methods by name from JavaScript.
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}
# The bridge, its WebView client and the Cordova compatibility layer are looked up reflectively.
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Plugins of this app (text-to-speech, camera, local notifications, share target, splash screen).
-keep class com.getcapacitor.community.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class app.capgo.sharetarget.** { *; }
-keep class cm.sabitori.app.** { *; }

# Local notifications stores its schedule as JSON and rebuilds it after a reboot.
-keep class com.capacitorjs.plugins.localnotifications.** { *; }
-dontwarn com.getcapacitor.**
