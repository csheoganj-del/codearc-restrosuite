package com.restrosuite.pos;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.util.Locale;

/**
 * JS bridge: window.AndroidInterface
 * print · speak · vibrate · sound · share
 */
public class WebAppInterface {
    private static final String TAG = "RSWebBridge";
    private final Context mContext;
    private TextToSpeech tts;
    private boolean ttsInitialized = false;
    private volatile String mPendingHindiText = null;

    public WebAppInterface(Context c) {
        mContext = c;
        initTTS();
    }

    private void initTTS() {
        tts = new TextToSpeech(mContext, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = tts.setLanguage(new Locale("hi", "IN"));
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.w(TAG, "Hindi TTS missing — English fallback");
                    tts.setLanguage(Locale.US);
                }
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) {}
                    @Override
                    public void onDone(String utteranceId) {
                        if ("english_announcement".equals(utteranceId) && mPendingHindiText != null) {
                            tts.setLanguage(new Locale("hi", "IN"));
                            tts.speak(mPendingHindiText, TextToSpeech.QUEUE_ADD, null, "hindi_announcement");
                            mPendingHindiText = null;
                        }
                    }
                    @Override public void onError(String utteranceId) {}
                });
                ttsInitialized = true;
            } else {
                Log.e(TAG, "TextToSpeech init failed");
            }
        });
    }

    @JavascriptInterface
    public void speak(String text) {
        if (tts != null && ttsInitialized && text != null) {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "simple_speech");
        }
    }

    @JavascriptInterface
    public void speakBilingual(final String englishText, final String hindiText) {
        if (tts != null && ttsInitialized) {
            mPendingHindiText = hindiText;
            tts.setLanguage(Locale.US);
            tts.speak(englishText != null ? englishText : "", TextToSpeech.QUEUE_FLUSH, null, "english_announcement");
        }
    }

    @JavascriptInterface
    public void vibrate(long milliseconds) {
        try {
            Vibrator v = (Vibrator) mContext.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            long ms = Math.max(10, Math.min(milliseconds, 2000));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(ms);
            }
        } catch (Exception e) {
            Log.w(TAG, "vibrate: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public void playSound(String soundType) {
        new Thread(() -> {
            try {
                android.media.ToneGenerator tg = new android.media.ToneGenerator(
                        android.media.AudioManager.STREAM_NOTIFICATION, 100);
                if ("success".equalsIgnoreCase(soundType) || "order_success".equalsIgnoreCase(soundType)) {
                    tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 150);
                    Thread.sleep(200);
                    tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 150);
                } else if ("alert".equalsIgnoreCase(soundType) || "error".equalsIgnoreCase(soundType)) {
                    tg.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 300);
                } else {
                    tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 150);
                }
                Thread.sleep(400);
                tg.release();
            } catch (Exception e) {
                Log.e(TAG, "playSound: " + e.getMessage());
            }
        }).start();
    }

    @JavascriptInterface
    public void printReceipt(final String htmlContent) {
        if (mContext instanceof MainActivity) {
            ((MainActivity) mContext).runOnUiThread(
                    () -> ((MainActivity) mContext).printReceipt(htmlContent));
        }
    }

    @JavascriptInterface
    public void shareText(String title, String text) {
        if (mContext instanceof MainActivity) {
            ((MainActivity) mContext).runOnUiThread(
                    () -> ((MainActivity) mContext).shareText(title, text));
        }
    }

    @JavascriptInterface
    public String getPlatform() {
        return "android";
    }

    @JavascriptInterface
    public String getAppVersion() {
        return BuildConfig.VERSION_NAME;
    }

    public void shutdown() {
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) {}
            tts = null;
        }
    }
}
