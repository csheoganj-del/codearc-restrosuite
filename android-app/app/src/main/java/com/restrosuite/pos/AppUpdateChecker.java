package com.restrosuite.pos;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-app APK updater.
 *
 * Polls https://restrosuite.codearc.co.in/downloads/updates.json for a higher
 * android.versionCode than BuildConfig.VERSION_CODE. When found, prompts the
 * user, downloads the APK with DownloadManager, then opens the system installer
 * via FileProvider.
 *
 * Web UI updates (when online) still come from the live site automatically —
 * this only updates the native shell / offline bundle.
 */
public final class AppUpdateChecker {
    private static final String TAG = "RSAppUpdate";
    private static final String FEED_URL =
            "https://restrosuite.codearc.co.in/downloads/updates.json";
    private static final String PREFS = "rs_app_update";
    private static final String K_SNOOZE_UNTIL = "snooze_until";
    private static final long SNOOZE_MS = 24L * 60L * 60L * 1000L;

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private boolean checking = false;
    private long downloadId = -1L;
    private BroadcastReceiver downloadReceiver;

    public AppUpdateChecker(Activity activity) {
        this.activity = activity;
    }

    /** Silent background check (respects 24h snooze). */
    public void checkQuietly() {
        if (isSnoozed()) return;
        check(true);
    }

    /** User-triggered check (ignores snooze, always shows result). */
    public void checkNow() {
        check(false);
    }

    private boolean isSnoozed() {
        long until = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getLong(K_SNOOZE_UNTIL, 0L);
        return until > System.currentTimeMillis();
    }

    private void snooze() {
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(K_SNOOZE_UNTIL, System.currentTimeMillis() + SNOOZE_MS)
                .apply();
    }

    private void check(boolean silent) {
        if (checking) return;
        checking = true;
        io.execute(() -> {
            try {
                JSONObject feed = fetchJson(FEED_URL);
                JSONObject android = feed.optJSONObject("android");
                if (android == null) {
                    postResult(silent, null, "no-android-feed");
                    return;
                }
                int remoteCode = android.optInt("versionCode", 0);
                String remoteName = android.optString("versionName", "");
                String apkUrl = android.optString("url", "");
                String notes = android.optString("notes", "");
                if (remoteCode <= 0 || apkUrl.isEmpty()) {
                    postResult(silent, null, "invalid-feed");
                    return;
                }
                if (remoteCode <= BuildConfig.VERSION_CODE) {
                    postResult(silent, null, "current");
                    return;
                }
                final UpdateInfo info = new UpdateInfo(remoteCode, remoteName, apkUrl, notes);
                main.post(() -> {
                    checking = false;
                    showUpdateDialog(info);
                });
            } catch (Exception e) {
                Log.w(TAG, "check failed: " + e.getMessage());
                postResult(silent, e, "error");
            }
        });
    }

    private void postResult(boolean silent, Exception e, String status) {
        main.post(() -> {
            checking = false;
            if (silent) return;
            if ("current".equals(status)) {
                Toast.makeText(activity,
                        "RestroSuite is up to date (v" + BuildConfig.VERSION_NAME + ")",
                        Toast.LENGTH_SHORT).show();
            } else if ("error".equals(status)) {
                Toast.makeText(activity,
                        "Update check failed: " + (e != null ? e.getMessage() : "network"),
                        Toast.LENGTH_LONG).show();
            }
        });
    }

    private void showUpdateDialog(UpdateInfo info) {
        if (activity.isFinishing()) return;
        String msg = "Version " + info.versionName + " (build " + info.versionCode + ") is ready.\n\n"
                + "You have v" + BuildConfig.VERSION_NAME + " (build " + BuildConfig.VERSION_CODE + ").\n\n"
                + "Download and install now? Your data stays on this device and in the cloud.";
        if (info.notes != null && !info.notes.isEmpty()) {
            msg += "\n\n" + info.notes;
        }
        new AlertDialog.Builder(activity)
                .setTitle("RestroSuite update available")
                .setMessage(msg)
                .setPositiveButton("Update now", (d, w) -> startDownload(info))
                .setNegativeButton("Later", (d, w) -> snooze())
                .setCancelable(true)
                .show();
    }

    private void startDownload(UpdateInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!activity.getPackageManager().canRequestPackageInstalls()) {
                Toast.makeText(activity,
                        "Allow installs from this app, then try Update again",
                        Toast.LENGTH_LONG).show();
                try {
                    Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    i.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(i);
                } catch (Exception e) {
                    Log.e(TAG, "open unknown sources: " + e.getMessage());
                }
                return;
            }
        }

        try {
            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                // Fallback: open APK URL in browser
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(info.url)));
                return;
            }
            // Clear old partial
            File dest = new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    "RestroSuite-update.apk");
            if (dest.exists()) //noinspection ResultOfMethodCallIgnored
                dest.delete();

            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(info.url));
            req.setTitle("RestroSuite " + info.versionName);
            req.setDescription("Downloading update…");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS,
                    "RestroSuite-update.apk");
            req.setMimeType("application/vnd.android.package-archive");
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);

            registerDownloadReceiver();
            downloadId = dm.enqueue(req);
            Toast.makeText(activity, "Downloading update…", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Log.e(TAG, "download start failed: " + e.getMessage());
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(info.url)));
            } catch (Exception e2) {
                Toast.makeText(activity, "Could not start download", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void registerDownloadReceiver() {
        if (downloadReceiver != null) return;
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (id != downloadId) return;
                DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) return;
                DownloadManager.Query q = new DownloadManager.Query();
                q.setFilterById(id);
                try (Cursor c = dm.query(q)) {
                    if (c != null && c.moveToFirst()) {
                        int statusIdx = c.getColumnIndex(DownloadManager.COLUMN_STATUS);
                        int status = statusIdx >= 0 ? c.getInt(statusIdx) : -1;
                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            int uriIdx = c.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                            String local = uriIdx >= 0 ? c.getString(uriIdx) : null;
                            installApk(local);
                        } else {
                            Toast.makeText(activity, "Download failed", Toast.LENGTH_LONG).show();
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "download complete handle: " + e.getMessage());
                }
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            activity.registerReceiver(downloadReceiver, filter);
        }
    }

    private void installApk(String localUri) {
        try {
            File file;
            if (localUri != null && localUri.startsWith("file:")) {
                file = new File(Uri.parse(localUri).getPath());
            } else {
                file = new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                        "RestroSuite-update.apk");
            }
            if (!file.exists()) {
                Toast.makeText(activity, "Downloaded APK not found", Toast.LENGTH_LONG).show();
                return;
            }
            Uri contentUri = FileProvider.getUriForFile(
                    activity,
                    activity.getPackageName() + ".fileprovider",
                    file
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "install failed: " + e.getMessage());
            Toast.makeText(activity, "Open the APK from Downloads to install", Toast.LENGTH_LONG).show();
        }
    }

    public void dispose() {
        if (downloadReceiver != null) {
            try {
                activity.unregisterReceiver(downloadReceiver);
            } catch (Exception ignored) {}
            downloadReceiver = null;
        }
        io.shutdownNow();
    }

    private static JSONObject fetchJson(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(15000);
        conn.setRequestProperty("Cache-Control", "no-cache");
        conn.setRequestProperty("Accept", "application/json");
        conn.setInstanceFollowRedirects(true);
        int code = conn.getResponseCode();
        if (code != 200) throw new Exception("HTTP " + code);
        BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();
        conn.disconnect();
        return new JSONObject(sb.toString());
    }

    private static final class UpdateInfo {
        final int versionCode;
        final String versionName;
        final String url;
        final String notes;

        UpdateInfo(int versionCode, String versionName, String url, String notes) {
            this.versionCode = versionCode;
            this.versionName = versionName == null ? "" : versionName;
            this.url = url;
            this.notes = notes == null ? "" : notes;
        }
    }
}
