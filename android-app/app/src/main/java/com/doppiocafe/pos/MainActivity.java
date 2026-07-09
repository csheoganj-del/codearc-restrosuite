package com.doppiocafe.pos;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Log;
import android.view.View;
import android.view.animation.AlphaAnimation;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "DoppioMainActivity";
    private WebView myWebView;
    private ProgressBar progressBar;
    private View splashView;
    private WebAppInterface jsInterface;
    private LicenseManager licenseManager;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private static final String APP_URL = "https://restrosuite.codearc.co.in/login";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Match the WebView mobile shell so Android and browser chrome feel identical.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().setStatusBarColor(Color.WHITE);
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getWindow().setNavigationBarColor(Color.WHITE);
            getWindow().getDecorView().setSystemUiVisibility(
                    getWindow().getDecorView().getSystemUiVisibility()
                            | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }

        // Initialize UI Elements
        myWebView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progressBar);

        // Programmatically overlay a premium splash screen view over the web content
        splashView = getLayoutInflater().inflate(R.layout.splash_screen, null);
        addContentView(splashView, new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));

        // Configure WebView
        setupWebView();

        // Start Network Monitoring
        setupNetworkMonitoring();

        // Boot loader sequence: short branded launch, then fade into the app shell.
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                fadeOutSplash();
            }
        }, 1200);
    }

    private void setupWebView() {
        WebSettings webSettings = myWebView.getSettings();
        myWebView.setBackgroundColor(Color.rgb(246, 247, 249));
        myWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        
        // CRITICAL settings for advanced web dashboards and offline local storage
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true); // Persists localStorage bills and menu
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(false);
        webSettings.setAllowUniversalAccessFromFileURLs(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        
        // Cache management: Use cache when offline, load normal when online
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        
        // Rendering optimizations
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setSupportZoom(false); // Mobile responsive is perfect, no zoom needed
        
        // The app shell is local, but all remote services must use HTTPS.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        // Setup JS Bridge interface
        jsInterface = new WebAppInterface(this);
        myWebView.addJavascriptInterface(jsInterface, "AndroidInterface");

        // Offline-lease: expose the license bridge so the web guard can persist
        // each renewed lease natively (EncryptedSharedPreferences).
        licenseManager = new LicenseManager(this);
        myWebView.addJavascriptInterface(new LicenseBridge(licenseManager, this), "AndroidLicense");

        // Set WebView clients
        myWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    String url = request.getUrl().toString();
                    // Allow URLs from restrosuite.codearc.co.in
                    if (url.startsWith("https://restrosuite.codearc.co.in/")) {
                        return false; // Let WebView load it
                    }
                    // All other external URLs open in browser
                    openExternalUrl(url);
                    return true;
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Allow URLs from restrosuite.codearc.co.in
                if (url.startsWith("https://restrosuite.codearc.co.in/")) {
                    return false; // Let WebView load it
                }
                // All other external URLs open in browser
                openExternalUrl(url);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                // Relay initial connection state to page
                triggerNetworkStateToWeb(isNetworkConnected());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                Log.e(TAG, "WebView error: " + error.toString());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (request.isForMainFrame()) {
                        Toast.makeText(MainActivity.this, "Error loading local dashboard assets.", Toast.LENGTH_LONG).show();
                    }
                }
            }
        });

        myWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, "Console: " + consoleMessage.message() + " -- Line "
                        + consoleMessage.lineNumber() + " of " + consoleMessage.sourceId());
                return true;
            }
        });

        // Load the app — or the native offline lock screen if the lease is
        // missing/expired/tampered and we have no connectivity to renew it.
        loadAppOrLock();
    }

    /**
     * Offline-lease gate. When online we always load the app and let the web
     * guard enforce + renew (it hands leases back through the AndroidLicense
     * bridge). When OFFLINE we first check the natively-stored lease: a valid,
     * unexpired one loads the cached app; otherwise we show a native lock
     * screen instead of the cached dashboard.
     */
    public void loadAppOrLock() {
        boolean online = isNetworkConnected();
        boolean lockedOffline = false;
        try {
            lockedOffline = !online && licenseManager != null && licenseManager.isOfflineLocked();
        } catch (Throwable t) {
            // Fail OPEN — a bug in the gate must never brick a paying outlet.
            Log.e(TAG, "license gate error (failing open): " + t.getMessage());
            lockedOffline = false;
        }

        if (lockedOffline) {
            Log.w(TAG, "Offline with no valid lease -> native lock screen");
            myWebView.loadDataWithBaseURL(null, LOCK_SCREEN_HTML, "text/html", "utf-8", null);
            return;
        }

        // Cache-bust the TOP-LEVEL document on every cold start (see history:
        // stale entry HTML caused "stuck on old version"). Sub-resources still
        // use normal HTTP caching via LOAD_DEFAULT.
        myWebView.loadUrl(APP_URL + "?_cachebust=" + System.currentTimeMillis());
    }

    private static final String LOCK_SCREEN_HTML =
        "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
        + "<style>html,body{height:100%;margin:0}body{background:radial-gradient(1200px 600px at 50% -10%,#1b2233,#0b0e16);"
        + "color:#fff;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;align-items:center;"
        + "justify-content:center;padding:24px}.c{max-width:440px;text-align:center;background:rgba(255,255,255,.04);"
        + "border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:38px 30px}.b{width:70px;height:70px;"
        + "border-radius:50%;margin:0 auto 20px;background:rgba(252,128,25,.15);display:flex;align-items:center;"
        + "justify-content:center;font-size:30px}h1{font-size:20px;margin:0 0 12px}p{font-size:14.5px;line-height:1.65;"
        + "color:#c7cede;margin:0 0 24px}button{background:#FC8019;color:#fff;border:none;border-radius:11px;"
        + "padding:13px 26px;font-weight:700;font-size:14.5px}.s{margin-top:16px;font-size:12.5px;color:#8b93a7}</style></head>"
        + "<body><div class='c'><div class='b'>&#128274;</div><h1>Reconnect to continue</h1>"
        + "<p>RestroSuite needs to verify your subscription. Please connect this device to the internet — "
        + "it will reactivate automatically once your plan is confirmed. Your data is safe.</p>"
        + "<button onclick=\"if(window.AndroidLicense&&AndroidLicense.retry){AndroidLicense.retry();}\">Retry now</button>"
        + "<div class='s'>Need help? Contact RestroSuite support.</div></div></body></html>";

    private void openExternalUrl(String url) {
        if (
            url == null
            || url.startsWith("javascript:")
            || url.startsWith("data:")
            || url.startsWith("content:")
            || url.startsWith("file:")
        ) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception error) {
            Log.e(TAG, "Unable to open external URL: " + error.getMessage());
        }
    }

    private void fadeOutSplash() {
        if (splashView != null && splashView.getVisibility() == View.VISIBLE) {
            AlphaAnimation fade = new AlphaAnimation(1.0f, 0.0f);
            fade.setDuration(280);
            fade.setAnimationListener(new android.view.animation.Animation.AnimationListener() {
                @Override
                public void onAnimationStart(android.view.animation.Animation animation) {}

                @Override
                public void onAnimationEnd(android.view.animation.Animation animation) {
                    splashView.setVisibility(View.GONE);
                }

                @Override
                public void onAnimationRepeat(android.view.animation.Animation animation) {}
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
                super.onAvailable(network);
                Log.d(TAG, "Network is Available");
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        triggerNetworkStateToWeb(true);
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                super.onLost(network);
                Log.d(TAG, "Network is Lost");
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        triggerNetworkStateToWeb(false);
                    }
                });
            }
        };

        connectivityManager.registerNetworkCallback(networkRequest, networkCallback);
    }

    private boolean isNetworkConnected() {
        if (connectivityManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network activeNetwork = connectivityManager.getActiveNetwork();
            if (activeNetwork == null) return false;
            NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);
            return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } else {
            // Deprecated, but fine for old devices
            android.net.NetworkInfo activeInfo = connectivityManager.getActiveNetworkInfo();
            return activeInfo != null && activeInfo.isConnected();
        }
    }

    private void triggerNetworkStateToWeb(boolean isOnline) {
        // Evaluate JavaScript on our main WebView, calling a global function in dashboard.js
        if (myWebView != null) {
            Log.d(TAG, "Relaying network status to Web. Online: " + isOnline);
            myWebView.evaluateJavascript("if (window.updateAndroidOfflineStatus) { window.updateAndroidOfflineStatus(" + !isOnline + "); }", null);
        }
    }

    public void printReceipt(final String htmlContent) {
        Log.d(TAG, "Launching Android PrintManager on temporary WebView...");
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    final PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    if (pm != null) {
                        final android.view.ViewGroup rootView = (android.view.ViewGroup) findViewById(android.R.id.content);
                        final WebView tempWebView = new WebView(MainActivity.this);
                        tempWebView.setVisibility(View.INVISIBLE);
                        if (rootView != null) {
                            rootView.addView(tempWebView);
                        }
                        
                        tempWebView.setWebViewClient(new WebViewClient() {
                            @Override
                            public void onPageFinished(WebView view, String url) {
                                String jobName = getString(R.string.app_name) + " Thermal Receipt";
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
                                
                                // Schedule cleanup of temporary WebView
                                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (rootView != null) {
                                            rootView.removeView(tempWebView);
                                        }
                                        tempWebView.destroy();
                                    }
                                }, 5000);
                            }
                        });
                        // Load receipt HTML content
                        tempWebView.loadDataWithBaseURL("file:///android_asset/", htmlContent, "text/html", "utf-8", null);
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "Error printing from temporary WebView: " + t.getMessage());
                    Toast.makeText(MainActivity.this, "Printing failed: " + t.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        });
    }

    @Override
    public void onBackPressed() {
        // Manage navigation logic. If WebView has back history, go back inside web container.
        if (myWebView != null && myWebView.canGoBack()) {
            myWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        // Shutdown resources cleanly
        if (jsInterface != null) {
            jsInterface.shutdown();
        }
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception e) {
                Log.e(TAG, "Unregistering network callback error: " + e.getMessage());
            }
        }
        super.onDestroy();
    }
}
