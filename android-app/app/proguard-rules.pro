# RestroSuite POS — keep JS bridges & crypto for offline lease
-keepclassmembers class com.restrosuite.pos.WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.restrosuite.pos.LicenseBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.restrosuite.pos.MainActivity$PlatformBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.restrosuite.pos.LicenseManager { *; }
-keep class com.restrosuite.pos.WebAppInterface { *; }
-keep class com.restrosuite.pos.LicenseBridge { *; }

# Security crypto
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# WebKit asset loader
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**
