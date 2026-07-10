package com.restrosuite.pos;

import android.util.Log;
import android.webkit.JavascriptInterface;

/**
 * JS bridge exposed to the WebView as window.AndroidLicense. The web
 * license-guard.js calls storeLease(...) each time it obtains a fresh lease, so
 * the native LicenseManager can persist it (EncryptedSharedPreferences) and
 * verify it offline on the next cold start.
 */
public class LicenseBridge {
    private static final String TAG = "RSLicense";
    private final LicenseManager manager;
    private final MainActivity activity;

    public LicenseBridge(LicenseManager manager, MainActivity activity) {
        this.manager = manager;
        this.activity = activity;
    }

    @JavascriptInterface
    public void storeLease(String lease, String serverTimeMs) {
        long t;
        try { t = Long.parseLong(serverTimeMs); } catch (Exception e) { t = System.currentTimeMillis(); }
        try {
            manager.storeLease(lease, t);
        } catch (Exception e) {
            Log.w(TAG, "storeLease bridge failed: " + e.getMessage());
        }
    }

    /** Called by the native lock screen's "Retry" button. */
    @JavascriptInterface
    public void retry() {
        if (activity != null) activity.runOnUiThread(activity::loadAppOrLock);
    }
}
