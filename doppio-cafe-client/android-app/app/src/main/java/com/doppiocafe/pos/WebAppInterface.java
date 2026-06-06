package com.doppiocafe.pos;

import android.content.Context;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import android.webkit.JavascriptInterface;

import android.speech.tts.UtteranceProgressListener;
import java.util.Locale;

public class WebAppInterface {
    private static final String TAG = "DoppioWebAppInterface";
    private final Context mContext;
    private TextToSpeech tts;
    private boolean ttsInitialized = false;
    private volatile String mPendingHindiText = null;

    public WebAppInterface(Context c) {
        mContext = c;
        initTTS();
    }

    private void initTTS() {
        tts = new TextToSpeech(mContext, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    // Test if Hindi is supported, default to English first
                    int result = tts.setLanguage(new Locale("hi", "IN"));
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        Log.e(TAG, "Hindi language pack is missing or not supported on this device. Falling back to English.");
                        tts.setLanguage(Locale.US);
                    }
                    
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {}

                        @Override
                        public void onDone(String utteranceId) {
                            if ("english_announcement".equals(utteranceId)) {
                                if (mPendingHindiText != null) {
                                    tts.setLanguage(new Locale("hi", "IN"));
                                    tts.speak(mPendingHindiText, TextToSpeech.QUEUE_ADD, null, "hindi_announcement");
                                    mPendingHindiText = null;
                                }
                            }
                        }

                        @Override
                        public void onError(String utteranceId) {}
                    });

                    ttsInitialized = true;
                } else {
                    Log.e(TAG, "TextToSpeech Initialization failed!");
                }
            }
        });
    }

    @JavascriptInterface
    public void speak(String text) {
        if (tts != null && ttsInitialized) {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "simple_speech");
        }
    }

    @JavascriptInterface
    public void speakBilingual(final String englishText, final String hindiText) {
        if (tts != null && ttsInitialized) {
            Log.d(TAG, "Speaking Bilingual. Eng: " + englishText + " | Hin: " + hindiText);
            // 1. Queue Hindi Text for UtteranceProgressListener
            mPendingHindiText = hindiText;

            // 2. Speak English first
            tts.setLanguage(Locale.US);
            tts.speak(englishText, TextToSpeech.QUEUE_FLUSH, null, "english_announcement");
        }
    }

    @JavascriptInterface
    public void vibrate(long milliseconds) {
        Vibrator v = (Vibrator) mContext.getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                // Deprecated in API 26, but fine for backwards compatibility
                v.vibrate(milliseconds);
            }
        }
    }

    @JavascriptInterface
    public void playSound(String soundType) {
        Log.d(TAG, "Playing Sound type: " + soundType);
        // Play native system notification sound as order bell
        try {
            // We can also bundle a custom raw sound, but playing a system ringtone is extremely reliable.
            // Alternatively, we use Android's ToneGenerator or MediaPlayer to play a pleasant POS checkout chime.
            // Let's play a high-quality success sound
            // We will play a short pleasant beep using ToneGenerator to be fully self-contained.
            android.media.ToneGenerator tg = new android.media.ToneGenerator(android.media.AudioManager.STREAM_NOTIFICATION, 100);
            if ("success".equalsIgnoreCase(soundType) || "order_success".equalsIgnoreCase(soundType)) {
                tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 150); // Double chime
                Thread.sleep(200);
                tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 150);
            } else if ("alert".equalsIgnoreCase(soundType)) {
                tg.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 300); // Warning tone
            } else {
                tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 150); // Single click chime
            }
        } catch (Exception e) {
            Log.e(TAG, "Error playing sound tone: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public void printReceipt(final String htmlContent) {
        Log.d(TAG, "Thermal Printing requested from WebView!");
        if (mContext instanceof MainActivity) {
            ((MainActivity) mContext).runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ((MainActivity) mContext).printReceipt(htmlContent);
                }
            });
        }
    }

    // Call this on Activity destroy to clean up resources and prevent memory leaks
    public void shutdown() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
    }
}
