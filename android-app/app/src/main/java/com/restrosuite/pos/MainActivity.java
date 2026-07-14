package com.restrosuite.pos;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AlphaAnimation;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

/**
 * RestroSuite POS — production WebView shell.
 *
 * Online  → remote production app (always latest deploy)
 * Offline → bundled assets via WebViewAssetLoader (full POS shell)
 * Locked  → native lease lock screen (no valid offline lease)
 */
public class MainActivity extends AppCompatActivity {
    private static final String TAG = "RestroSuiteMain";

    /** Production web app origin (must stay HTTPS). */
    public static final String REMOTE_ORIGIN = "https://restrosuite.codearc.co.in";
    private static final String REMOTE_ENTRY = REMOTE_ORIGIN + "/login";

    /** Local offline shell served via WebViewAssetLoader. */
    private static final String LOCAL_ORIGIN = "https://appassets.androidplatform.net";
    private static final String LOCAL_ENTRY = LOCAL_ORIGIN + "/assets/login.html";

    private WebView myWebView;
    private ProgressBar progressBar;
    private View splashView;
    private WebAppInterface jsInterface;
    private LicenseManager licenseManager;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean usingLocalShell = false;
    private boolean exitArmed = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Keep screen awake on POS terminals during a shift.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        applySystemBars();

        myWebView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progressBar);

        splashView = getLayoutInflater().inflate(R.layout.splash_screen, null);
        addContentView(splashView, new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));

        setupWebView();
        setupNetworkMonitoring();

        mainHandler.postDelayed(this::fadeOutSplash, 1100);
    }

    private void applySystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().setStatusBarColor(Color.parseColor("#F3EFE8"));
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getWindow().setNavigationBarColor(Color.parseColor("#F3EFE8"));
            getWindow().getDecorView().setSystemUiVisibility(
                    getWindow().getDecorView().getSystemUiVisibility()
                            | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        // Brand accent on API 23+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("#F3EFE8"));
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        // Serve android assets under a secure https host (offline shell).
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings webSettings = myWebView.getSettings();
        myWebView.setBackgroundColor(Color.parseColor("#F3EFE8"));
        myWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(false);
        webSettings.setSupportMultipleWindows(false);

        // Security: no raw file:// browsing. Offline uses AssetLoader https origin.
        webSettings.setAllowFileAccess(false);
        webSettings.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            webSettings.setAllowUniversalAccessFromFileURLs(false);
            webSettings.setAllowFileAccessFromFileURLs(false);
        }

        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setSupportZoom(false);
        webSettings.setBuiltInZoomControls(false);
        webSettings.setDisplayZoomControls(false);
        webSettings.setTextZoom(100);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webSettings.setSafeBrowsingEnabled(true);
        }

        // Cookies required for session continuity with Supabase / gateway.
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(myWebView, true);
        }

        // Identify Android shell to the web app.
        String ua = webSettings.getUserAgentString() + " RestroSuiteAndroid/" + BuildConfig.VERSION_NAME;
        webSettings.setUserAgentString(ua);

        jsInterface = new WebAppInterface(this);
        myWebView.addJavascriptInterface(jsInterface, "AndroidInterface");

        licenseManager = new LicenseManager(this);
        myWebView.addJavascriptInterface(new LicenseBridge(licenseManager, this), "AndroidLicense");
        myWebView.addJavascriptInterface(new PlatformBridge(), "AndroidPlatform");

        myWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "No app to open this download", Toast.LENGTH_SHORT).show();
                }
            }
        });

        myWebView.setWebViewClient(new WebViewClient() {
            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (assetLoader != null && request != null && request.getUrl() != null) {
                    WebResourceResponse local = assetLoader.shouldInterceptRequest(request.getUrl());
                    if (local != null) return local;
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return false;
                return handleUrl(request.getUrl().toString());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (progressBar != null) progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (progressBar != null) progressBar.setVisibility(View.GONE);
                injectPlatformFlags();
                triggerNetworkStateToWeb(isNetworkConnected());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && request != null && request.isForMainFrame()) {
                    Log.e(TAG, "Main frame error: " + error.getDescription());
                    // Remote failed while offline → fall back to bundled shell
                    if (!isNetworkConnected() && !usingLocalShell) {
                        loadLocalShell();
                    } else if (!usingLocalShell) {
                        showErrorShell(String.valueOf(error.getDescription()));
                    }
                }
            }
        });

        myWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (progressBar == null) return;
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        progressBar.setIndeterminate(false);
                        progressBar.setProgress(newProgress, true);
                    }
                } else {
                    progressBar.setVisibility(View.GONE);
                    progressBar.setIndeterminate(true);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                // Menu image / CSV import from POS
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, 1001);
                    return true;
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
            }
        });

        loadAppOrLock();
    }

    private boolean handleUrl(String url) {
        if (url == null) return true;
        if (url.startsWith("javascript:") || url.startsWith("about:")) return false;

        // Same-app origins stay in WebView
        if (url.startsWith(REMOTE_ORIGIN) || url.startsWith(LOCAL_ORIGIN)) {
            return false;
        }
        // WhatsApp / tel / mailto / external
        if (url.startsWith("https://wa.me/")
                || url.startsWith("https://api.whatsapp.com/")
                || url.startsWith("whatsapp:")
                || url.startsWith("tel:")
                || url.startsWith("mailto:")
                || url.startsWith("geo:")) {
            openExternalUrl(url);
            return true;
        }
        if (url.startsWith("http://") || url.startsWith("https://")) {
            openExternalUrl(url);
            return true;
        }
        return true;
    }

    /**
     * Online → remote app (latest). Offline with valid lease → local assets.
     * Offline without lease past grace → lock screen.
     */
    public void loadAppOrLock() {
        boolean online = isNetworkConnected();
        boolean lockedOffline = false;
        try {
            lockedOffline = !online && licenseManager != null && licenseManager.isOfflineLocked();
        } catch (Throwable t) {
            Log.e(TAG, "license gate error (failing open): " + t.getMessage());
            lockedOffline = false;
        }

        if (lockedOffline) {
            Log.w(TAG, "Offline with no valid lease -> native lock screen");
            usingLocalShell = false;
            myWebView.loadDataWithBaseURL(null, LOCK_SCREEN_HTML, "text/html", "utf-8", null);
            return;
        }

        if (online) {
            usingLocalShell = false;
            myWebView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
            myWebView.loadUrl(REMOTE_ENTRY + "?_cachebust=" + System.currentTimeMillis());
        } else {
            loadLocalShell();
        }
    }

    private void loadLocalShell() {
        usingLocalShell = true;
        myWebView.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        Log.i(TAG, "Loading bundled offline shell");
        myWebView.loadUrl(LOCAL_ENTRY);
        Toast.makeText(this, "Offline mode — using on-device RestroSuite", Toast.LENGTH_SHORT).show();
    }

    private void showErrorShell(String detail) {
        String safe = detail == null ? "Unknown error" : detail.replace("<", "&lt;").replace(">", "&gt;");
        String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>body{font-family:system-ui;background:#F3EFE8;color:#16151c;display:flex;align-items:center;"
                + "justify-content:center;min-height:100vh;margin:0;padding:24px}"
                + ".c{max-width:420px;text-align:center;background:#fff;border-radius:16px;padding:28px;"
                + "box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{font-size:18px;margin:0 0 10px}"
                + "p{font-size:13.5px;color:#6b6570;line-height:1.5}button{background:#FF4F00;color:#fff;border:none;"
                + "border-radius:10px;padding:12px 20px;font-weight:700;margin:6px}</style></head><body><div class='c'>"
                + "<h1>Could not load RestroSuite</h1><p>" + safe + "</p>"
                + "<button onclick=\"if(window.AndroidLicense)AndroidLicense.retry()\">Retry</button>"
                + "<button onclick=\"location.href='" + LOCAL_ENTRY + "'\">Open offline copy</button>"
                + "</div></body></html>";
        myWebView.loadDataWithBaseURL(LOCAL_ORIGIN, html, "text/html", "utf-8", null);
    }

    private void injectPlatformFlags() {
        String js = "(function(){try{"
                + "window.RS_ANDROID=true;"
                + "window.RS_PLATFORM='android';"
                + "window.RS_APP_VERSION='" + BuildConfig.VERSION_NAME + "';"
                + "window.RS_OFFLINE_SHELL=" + (usingLocalShell ? "true" : "false") + ";"
                + "document.documentElement.setAttribute('data-rs-android','1');"
                + "}catch(e){}})();";
        myWebView.evaluateJavascript(js, null);
    }

    private static final String LOCK_SCREEN_HTML =
            "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    + "<style>html,body{height:100%;margin:0}body{background:radial-gradient(1200px 600px at 50% -10%,#2a1a10,#141210);"
                    + "color:#fff;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;align-items:center;"
                    + "justify-content:center;padding:24px}.c{max-width:440px;text-align:center;background:rgba(255,255,255,.05);"
                    + "border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:38px 30px}.b{width:72px;height:72px;"
                    + "border-radius:50%;margin:0 auto 18px;background:rgba(255,79,0,.18);display:flex;align-items:center;"
                    + "justify-content:center;font-size:30px}h1{font-size:20px;margin:0 0 12px}p{font-size:14.5px;line-height:1.65;"
                    + "color:#d4cdc4;margin:0 0 24px}button{background:#FF4F00;color:#fff;border:none;border-radius:11px;"
                    + "padding:13px 26px;font-weight:700;font-size:14.5px}.s{margin-top:16px;font-size:12.5px;color:#9a9188}</style></head>"
                    + "<body><div class='c'><div class='b'>&#128274;</div><h1>Reconnect to continue</h1>"
                    + "<p>RestroSuite needs to verify your subscription. Connect this device to the internet — "
                    + "it reactivates automatically once your plan is confirmed. Your local data stays safe.</p>"
                    + "<button onclick=\"if(window.AndroidLicense&&AndroidLicense.retry){AndroidLicense.retry();}\">Retry now</button>"
                    + "<div class='s'>RestroSuite POS · offline lease expired</div></div></body></html>";

    private void openExternalUrl(String url) {
        if (url == null
                || url.startsWith("javascript:")
                || url.startsWith("data:")
                || url.startsWith("content:")
                || url.startsWith("file:")) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception error) {
            Log.e(TAG, "Unable to open external URL: " + error.getMessage());
            Toast.makeText(this, "Cannot open link", Toast.LENGTH_SHORT).show();
        }
    }

    private void fadeOutSplash() {
        if (splashView != null && splashView.getVisibility() == View.VISIBLE) {
            AlphaAnimation fade = new AlphaAnimation(1.0f, 0.0f);
            fade.setDuration(280);
            fade.setAnimationListener(new android.view.animation.Animation.AnimationListener() {
                @Override public void onAnimationStart(android.view.animation.Animation animation) {}
                @Override
                public void onAnimationEnd(android.view.animation.Animation animation) {
                    splashView.setVisibility(View.GONE);
                }
                @Override public void onAnimationRepeat(android.view.animation.Animation animation) {}
            });
            splashView.startAnimation(fade);
        }
    }

    private void setupNetworkMonitoring() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;

        NetworkRequest networkRequest = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                runOnUiThread(() -> {
                    triggerNetworkStateToWeb(true);
                    // If we were on lock/error/local and come online, offer remote refresh
                    if (usingLocalShell || isLockOrErrorUrl()) {
                        // Soft: only auto-switch if currently locked; local shell stays until user retries
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                runOnUiThread(() -> triggerNetworkStateToWeb(false));
            }
        };

        connectivityManager.registerNetworkCallback(networkRequest, networkCallback);
    }

    private boolean isLockOrErrorUrl() {
        String u = myWebView != null ? myWebView.getUrl() : null;
        return u == null || u.startsWith("data:");
    }

    private boolean isNetworkConnected() {
        if (connectivityManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network activeNetwork = connectivityManager.getActiveNetwork();
            if (activeNetwork == null) return false;
            NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);
            return capabilities != null
                    && (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    || capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
        } else {
            android.net.NetworkInfo activeInfo = connectivityManager.getActiveNetworkInfo();
            return activeInfo != null && activeInfo.isConnected();
        }
    }

    private void triggerNetworkStateToWeb(boolean isOnline) {
        if (myWebView != null) {
            myWebView.evaluateJavascript(
                    "if (window.updateAndroidOfflineStatus) { window.updateAndroidOfflineStatus(" + !isOnline + "); }",
                    null);
        }
    }

    public void printReceipt(final String htmlContent) {
        runOnUiThread(() -> {
            try {
                final PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm == null) {
                    Toast.makeText(this, "Print service unavailable", Toast.LENGTH_SHORT).show();
                    return;
                }
                final android.view.ViewGroup rootView = findViewById(android.R.id.content);
                final WebView tempWebView = new WebView(MainActivity.this);
                tempWebView.setVisibility(View.INVISIBLE);
                if (rootView != null) rootView.addView(tempWebView);

                tempWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        String jobName = getString(R.string.app_name) + " Receipt";
                        PrintDocumentAdapter printAdapter;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            printAdapter = tempWebView.createPrintDocumentAdapter(jobName);
                        } else {
                            printAdapter = tempWebView.createPrintDocumentAdapter();
                        }
                        PrintAttributes.Builder printBuilder = new PrintAttributes.Builder();
                        printBuilder.setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME);
                        PrintAttributes.MediaSize custom58mm = new PrintAttributes.MediaSize(
                                "Roll58mm", "58mm Thermal Roll", 2283, 12000);
                        printBuilder.setMediaSize(custom58mm);
                        pm.print(jobName, printAdapter, printBuilder.build());
                        mainHandler.postDelayed(() -> {
                            if (rootView != null) rootView.removeView(tempWebView);
                            tempWebView.destroy();
                        }, 5000);
                    }
                });
                tempWebView.loadDataWithBaseURL(LOCAL_ORIGIN + "/assets/", htmlContent, "text/html", "utf-8", null);
            } catch (Throwable t) {
                Log.e(TAG, "Print failed: " + t.getMessage());
                Toast.makeText(this, "Printing failed", Toast.LENGTH_LONG).show();
            }
        });
    }

    public void shareText(String title, String text) {
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, title != null ? title : "RestroSuite");
            send.putExtra(Intent.EXTRA_TEXT, text != null ? text : "");
            startActivity(Intent.createChooser(send, title != null ? title : "Share"));
        } catch (Exception e) {
            Toast.makeText(this, "Share failed", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1001 && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                } else if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    results = new Uri[n];
                    for (int i = 0; i < n; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (myWebView != null && myWebView.canGoBack()) {
            myWebView.goBack();
            return;
        }
        if (exitArmed) {
            super.onBackPressed();
            return;
        }
        exitArmed = true;
        Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show();
        mainHandler.postDelayed(() -> exitArmed = false, 2000);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (myWebView != null) myWebView.onResume();
    }

    @Override
    protected void onPause() {
        if (myWebView != null) myWebView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (jsInterface != null) jsInterface.shutdown();
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception e) {
                Log.e(TAG, "Unregister network callback: " + e.getMessage());
            }
        }
        if (myWebView != null) {
            myWebView.stopLoading();
            myWebView.destroy();
            myWebView = null;
        }
        super.onDestroy();
    }

    /** Lightweight platform info for the web app. */
    private class PlatformBridge {
        @JavascriptInterface
        public String getVersion() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public int getVersionCode() {
            return BuildConfig.VERSION_CODE;
        }

        @JavascriptInterface
        public boolean isOnline() {
            return isNetworkConnected();
        }

        @JavascriptInterface
        public boolean isOfflineShell() {
            return usingLocalShell;
        }

        @JavascriptInterface
        public void openRemote() {
            runOnUiThread(() -> {
                if (isNetworkConnected()) {
                    usingLocalShell = false;
                    myWebView.loadUrl(REMOTE_ENTRY + "?_cachebust=" + System.currentTimeMillis());
                } else {
                    Toast.makeText(MainActivity.this, "Still offline", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void openLocal() {
            runOnUiThread(MainActivity.this::loadLocalShell);
        }

        @JavascriptInterface
        public void share(String title, String text) {
            runOnUiThread(() -> shareText(title, text));
        }

        @JavascriptInterface
        public void keepAwake(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
}
