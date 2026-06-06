package com.doppiocafe.pos;

import android.content.Context;
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
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Configure system UI bar styling for premium full-screen immersive feel
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().setStatusBarColor(getResources().getColor(R.color.primary_brand_dark, getTheme()));
            getWindow().setNavigationBarColor(getResources().getColor(R.color.primary_brand_dark, getTheme()));
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

        // Boot loader sequence: Show splash for 2.5 seconds, then fade out
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                fadeOutSplash();
            }
        }, 2500);
    }

    private void setupWebView() {
        WebSettings webSettings = myWebView.getSettings();
        
        // CRITICAL settings for advanced web dashboards and offline local storage
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true); // Persists localStorage bills and menu
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowUniversalAccessFromFileURLs(false);
        webSettings.setAllowFileAccessFromFileURLs(false);
        
        // Cache management: Use cache when offline, load normal when online
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        
        // Rendering optimizations
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setSupportZoom(false); // Mobile responsive is perfect, no zoom needed
        
        // Mixed content (HTTP & HTTPS) - allowed for syncing local Supabase / local printers
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Setup JS Bridge interface
        jsInterface = new WebAppInterface(this);
        myWebView.addJavascriptInterface(jsInterface, "AndroidInterface");

        // Set WebView clients
        myWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    String url = request.getUrl().toString();
                    if (url.endsWith("index.html")) {
                        view.loadUrl("file:///android_asset/login.html");
                        return true;
                    }
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.endsWith("index.html")) {
                    view.loadUrl("file:///android_asset/login.html");
                    return true;
                }
                return false;
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

        // Load the main entry page from assets (loading the dedicated cashier login page!)
        myWebView.loadUrl("file:///android_asset/login.html");
    }

    private void fadeOutSplash() {
        if (splashView != null && splashView.getVisibility() == View.VISIBLE) {
            AlphaAnimation fade = new AlphaAnimation(1.0f, 0.0f);
            fade.setDuration(600); // smooth 600ms fade transition
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
        Log.d(TAG, "Launching Android PrintManager directly on main WebView...");
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    // Use system SERVICE definition safely
                    PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    if (pm != null && myWebView != null) {
                        String jobName = getString(R.string.app_name) + " Thermal Receipt";
                        
                        // Create PrintDocumentAdapter from our main visible WebView
                        PrintDocumentAdapter printAdapter;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            printAdapter = myWebView.createPrintDocumentAdapter(jobName);
                        } else {
                            printAdapter = myWebView.createPrintDocumentAdapter();
                        }
                        
                        // Set monochrome thermal roll attributes optimized for 58mm (2.28 inch width)
                        PrintAttributes.Builder printBuilder = new PrintAttributes.Builder();
                        printBuilder.setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME);
                        
                        PrintAttributes.MediaSize custom58mm = new PrintAttributes.MediaSize(
                                "Roll58mm", "58mm Thermal Roll", 2283, 12000);
                        printBuilder.setMediaSize(custom58mm);
                        
                        pm.print(jobName, printAdapter, printBuilder.build());
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "Error printing from main WebView: " + t.getMessage());
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
