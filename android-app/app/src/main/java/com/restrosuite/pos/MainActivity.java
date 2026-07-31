package com.restrosuite.pos;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
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
import android.webkit.PermissionRequest;
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

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
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
    private static final int REQ_CAMERA = 4101;

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
    private LanDiscoveryBridge lanDiscoveryBridge;
    private LicenseManager licenseManager;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingWebPermissionRequest;
    private boolean usingLocalShell = false;
    private boolean exitArmed = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private AppUpdateChecker appUpdateChecker;

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

        appUpdateChecker = new AppUpdateChecker(this);
        // After splash: silent native APK update check (UI still auto-updates via live site when online)
        mainHandler.postDelayed(() -> {
            if (isNetworkConnected() && appUpdateChecker != null) {
                appUpdateChecker.checkQuietly();
            }
        }, 4500);

        mainHandler.postDelayed(this::fadeOutSplash, 1100);
    }

    private void applySystemBars() {
        // Immersive POS chrome — cream bars match RestroSuite shell (no browser look)
        final int cream = Color.parseColor("#F3EFE8");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(cream);
            getWindow().setNavigationBarColor(cream);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        // Draw edge-to-edge under system bars (API 30+) without looking like a browser
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
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
        // App-like scrolling (no rubber-band browser chrome)
        myWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        myWebView.setVerticalScrollBarEnabled(false);
        myWebView.setHorizontalScrollBarEnabled(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            myWebView.setNestedScrollingEnabled(true);
        }
        // Geolocation for future table maps / delivery — denied by default unless granted
        webSettings.setGeolocationEnabled(false);

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
        lanDiscoveryBridge = new LanDiscoveryBridge(myWebView);
        myWebView.addJavascriptInterface(lanDiscoveryBridge, "AndroidLan");

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
                    Uri uri = request.getUrl();
                    // Clean-URL fallback: /assets/dashboard → /assets/dashboard.html
                    Uri tryUri = rewriteLocalCleanUrl(uri);
                    WebResourceResponse local = assetLoader.shouldInterceptRequest(tryUri);
                    if (local != null) return local;
                    if (!tryUri.equals(uri)) {
                        local = assetLoader.shouldInterceptRequest(uri);
                        if (local != null) return local;
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return false;
                String raw = request.getUrl().toString();
                String fixed = rewriteLocalCleanUrlString(raw);
                if (!fixed.equals(raw)) {
                    view.loadUrl(fixed);
                    return true;
                }
                return handleUrl(raw);
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                String fixed = rewriteLocalCleanUrlString(url);
                if (url != null && !fixed.equals(url)) {
                    view.loadUrl(fixed);
                    return true;
                }
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

            /** Required for getUserMedia / staff table QR scanner inside WebView. */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                if (request == null) return;
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                pendingWebPermissionRequest = null;
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

    /**
     * Offline shell has no Vercel cleanUrls. Map /assets/dashboard → dashboard.html
     * so login redirects (location.href='dashboard') work inside WebViewAssetLoader.
     */
    private Uri rewriteLocalCleanUrl(Uri uri) {
        if (uri == null) return null;
        String host = uri.getHost();
        if (host == null || !host.contains("androidplatform.net")) return uri;
        String path = uri.getPath();
        if (path == null || path.isEmpty()) return uri;
        // Already a static asset with extension
        int slash = path.lastIndexOf('/');
        String last = slash >= 0 ? path.substring(slash + 1) : path;
        if (last.isEmpty() || last.contains(".")) return uri;
        // Known app routes without .html
        String[] pages = {
                "dashboard", "login", "home", "order", "qr-order", "kds", "tokens",
                "bill", "feedback", "privacy", "terms", "refund-policy", "index",
                "install", "status"
        };
        boolean match = false;
        for (String p : pages) {
            if (p.equals(last)) { match = true; break; }
        }
        if (!match) return uri;
        Uri.Builder b = uri.buildUpon().path(path + ".html");
        return b.build();
    }

    private String rewriteLocalCleanUrlString(String url) {
        if (url == null || !url.startsWith(LOCAL_ORIGIN)) return url == null ? "" : url;
        try {
            return rewriteLocalCleanUrl(Uri.parse(url)).toString();
        } catch (Exception e) {
            return url;
        }
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP || request == null) return;
        boolean wantsCamera = false;
        for (String res : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                    || PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                wantsCamera = true;
                break;
            }
        }
        if (wantsCamera) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingWebPermissionRequest = request;
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                return;
            }
        }
        try {
            request.grant(request.getResources());
        } catch (Exception e) {
            Log.e(TAG, "grant web permission failed: " + e.getMessage());
            try { request.deny(); } catch (Exception ignored) {}
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_CAMERA) return;
        PermissionRequest pending = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;
        if (pending == null) return;
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        try {
            if (granted) pending.grant(pending.getResources());
            else pending.deny();
        } catch (Exception e) {
            Log.e(TAG, "onRequestPermissionsResult: " + e.getMessage());
        }
        if (!granted) {
            Toast.makeText(this, "Camera permission needed to scan table QR codes", Toast.LENGTH_LONG).show();
        }
    }

    private boolean handleUrl(String url) {
        if (url == null) return true;
        if (url.startsWith("javascript:") || url.startsWith("about:")) return false;

        // Same-app origins stay in WebView (rewrite clean URLs first)
        if (url.startsWith(LOCAL_ORIGIN)) {
            String fixed = rewriteLocalCleanUrlString(url);
            if (!fixed.equals(url) && myWebView != null) {
                myWebView.loadUrl(fixed);
                return true;
            }
            return false;
        }
        if (url.startsWith(REMOTE_ORIGIN)) {
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

    /** Public anon credentials — same as web. Required when offline shell has no /api/config. */
    private static final String SUPABASE_URL = "https://htkauiibuejetimfiavs.supabase.co";
    private static final String SUPABASE_ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk";

    /** Runs before page scripts when API allows; keeps offline-shell login cloud-capable. */
    private String envBootstrapJs() {
        return "(function(){try{"
                + "window.ENV_SUPABASE_URL='" + SUPABASE_URL + "';"
                + "window.ENV_SUPABASE_ANON_KEY='" + SUPABASE_ANON_KEY + "';"
                + "window.__SUPABASE_URL__=window.__SUPABASE_URL__||window.ENV_SUPABASE_URL;"
                + "window.__SUPABASE_ANON_KEY__=window.__SUPABASE_ANON_KEY__||window.ENV_SUPABASE_ANON_KEY;"
                + "window.RS_ANDROID=true;window.RS_NATIVE_APP=true;window.RS_PLATFORM='android';"
                + "}catch(e){}})();";
    }

    private void injectPlatformFlags() {
        // Tell the web shell it is inside a native Android package — hide PWA install,
        // use app safe-area, denser mobile chrome, haptics via AndroidInterface.
        // Also re-apply Supabase env (page may have loaded before document-start JS).
        String js = envBootstrapJs().replace("})();", "")
                + "window.RS_APP_VERSION='" + BuildConfig.VERSION_NAME + "';"
                + "window.RS_OFFLINE_SHELL=" + (usingLocalShell ? "true" : "false") + ";"
                // Offline shell: map clean routes to .html (no Vercel rewrites)
                + "if(" + (usingLocalShell ? "true" : "false") + "){try{"
                + "window.RS_LOCAL_PAGE=function(n){n=String(n||'').replace(/^\\//,'').replace(/\\.html$/i,'');"
                + "return n? (n+'.html'):'dashboard.html';};"
                + "if(!window.__rsCleanNavPatched){window.__rsCleanNavPatched=1;"
                + "var _as=HTMLAnchorElement&&HTMLAnchorElement.prototype;"
                + "document.addEventListener('click',function(ev){"
                + "var a=ev.target&&ev.target.closest&&ev.target.closest('a[href]');if(!a)return;"
                + "var h=a.getAttribute('href')||'';if(!h||h.charAt(0)==='#'||/^(https?:|mailto:|tel:|javascript:)/i.test(h))return;"
                + "if(/\\.html?(?:[?#]|$)/i.test(h)||/\\.[a-z0-9]+(?:[?#]|$)/i.test(h))return;"
                + "if(/^(dashboard|login|home|order|qr-order|kds|tokens|bill|feedback|index)(?:[?#]|$)/i.test(h)){"
                + "ev.preventDefault();location.href=h.replace(/^([^?#]+)/,function(m){return m.replace(/\\/?$/,'')+'.html';});}"
                + "},true);}"
                + "}catch(e){}}"
                + "document.documentElement.setAttribute('data-rs-android','1');"
                + "document.documentElement.setAttribute('data-rs-native','1');"
                + "document.documentElement.classList.add('rs-android-app','rs-native-app');"
                + "try{if(window.RS_API&&typeof RS_API.refreshConfig==='function')RS_API.refreshConfig();"
                + "else if(window.__SUPABASE_URL__&&window.RS_API){window.RS_API.configured=true;}}catch(e){}"
                + "var s=document.getElementById('rs-android-app-css');"
                + "if(!s){s=document.createElement('style');s.id='rs-android-app-css';"
                + "s.textContent="
                + "'html.rs-android-app,html.rs-android-app body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent;}"
                + "html.rs-android-app .tb-version,html.rs-android-app .pwa-install,"
                + "html.rs-android-app #pwa-install-btn,html.rs-android-app .rs-install-prompt{display:none!important;}"
                + "html.rs-android-app .topbar{padding-top:max(6px,env(safe-area-inset-top));}"
                + "html.rs-android-app .mobile-bottom-nav,"
                + "html.rs-android-app .mnav{padding-bottom:max(8px,env(safe-area-inset-bottom));}"
                + "html.rs-android-app .pos-cart{max-height:calc(100dvh - 88px);}';"
                + "document.head.appendChild(s);}"
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
                    triggerNetworkStateToWeb(isNetworkConnected());
                    // If we were on lock/error/local and come online, offer remote refresh
                    if (usingLocalShell || isLockOrErrorUrl()) {
                        // Soft: only auto-switch if currently locked; local shell stays until user retries
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                runOnUiThread(() -> triggerNetworkStateToWeb(isNetworkConnected()));
            }

            @Override
            public void onCapabilitiesChanged(
                    @NonNull Network network,
                    @NonNull NetworkCapabilities capabilities
            ) {
                runOnUiThread(() -> triggerNetworkStateToWeb(
                        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                ));
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
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
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
        if (appUpdateChecker != null) {
            appUpdateChecker.dispose();
            appUpdateChecker = null;
        }
        if (jsInterface != null) jsInterface.shutdown();
        if (lanDiscoveryBridge != null) {
            lanDiscoveryBridge.shutdown();
            lanDiscoveryBridge = null;
        }
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

        /** Trigger native APK update check (user-facing). */
        @JavascriptInterface
        public void checkForUpdates() {
            runOnUiThread(() -> {
                if (appUpdateChecker != null) appUpdateChecker.checkNow();
                else Toast.makeText(MainActivity.this, "Update checker unavailable", Toast.LENGTH_SHORT).show();
            });
        }
    }
}
