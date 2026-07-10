package com.restrosuite.pos;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.util.Log;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;

/**
 * RestroSuite — native offline-lease gate (Android).
 *
 * The Android app loads the remote web app in a WebView, so the JS
 * license-guard.js already enforces while ONLINE and hands each renewed lease
 * down through the "AndroidLicense" bridge for encrypted persistence. This
 * class is the OFFLINE backstop: before showing the cached web app with no
 * connectivity, MainActivity asks isOfflineLocked() whether a valid, unexpired,
 * untampered lease exists. If not (and past the bootstrap grace), it shows a
 * native lock screen instead of the cached dashboard — much harder to bypass
 * than the inspectable JS layer.
 *
 * Signature: ECDSA P-256 / SHA-256. The lease is signed server-side with
 * WebCrypto, which emits IEEE-P1363 (raw r||s); Java's SHA256withECDSA wants
 * DER, so we convert before verifying. Keep the constants below in sync with
 * assets/license-config.js.
 */
public class LicenseManager {
    private static final String TAG = "RSLicense";

    // MUST match assets/license-config.js (RS_LICENSE_PUBLIC_KEY_SPKI_B64).
    private static final String PUBLIC_KEY_SPKI_B64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKR/Nnyv7NfFdHoNmQ0lkSv/NCYitxAT5d42DcKCaRkkSIeQsTdD7tTm5PG5Rosqxc22YDo5/eP81D7aol0OkXg==";

    private static final long BOOTSTRAP_GRACE_MS = 3L * 24 * 60 * 60 * 1000; // 3 days
    private static final long CLOCK_SKEW_TOLERANCE_MS = 60L * 1000;

    private static final String PREFS = "rs_license_secure";
    private static final String K_LEASE = "lease";
    private static final String K_HWM = "hwm";
    private static final String K_FIRST_SEEN = "first_seen";

    private final SharedPreferences prefs;

    public LicenseManager(Context ctx) {
        SharedPreferences p;
        try {
            MasterKey key = new MasterKey.Builder(ctx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
            p = EncryptedSharedPreferences.create(
                ctx, PREFS, key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception e) {
            Log.e(TAG, "EncryptedSharedPreferences unavailable, falling back: " + e.getMessage());
            p = ctx.getSharedPreferences(PREFS + "_fb", Context.MODE_PRIVATE);
        }
        prefs = p;
    }

    /** Called from the JS bridge whenever the web guard obtains a fresh lease. */
    public synchronized void storeLease(String lease, long serverTimeMs) {
        long now = System.currentTimeMillis();
        long hwm = Math.max(prefs.getLong(K_HWM, 0), Math.max(serverTimeMs, now));
        SharedPreferences.Editor e = prefs.edit();
        e.putString(K_LEASE, lease == null ? "" : lease);
        e.putLong(K_HWM, hwm);
        if (prefs.getLong(K_FIRST_SEEN, 0) == 0) e.putLong(K_FIRST_SEEN, now);
        e.apply();
    }

    /**
     * Offline decision: returns true if the app should be LOCKED (no valid
     * lease and past the bootstrap grace, or the clock was rolled back).
     * Mirrors evaluateLicense() in assets/license-guard.js.
     */
    public synchronized boolean isOfflineLocked() {
        long now = System.currentTimeMillis();
        long storedHwm = prefs.getLong(K_HWM, 0);
        long hwm = Math.max(storedHwm, now);
        long firstSeen = prefs.getLong(K_FIRST_SEEN, 0);

        // Persist the bumped HWM (and seed firstSeen on the very first run so
        // the bootstrap window is bounded).
        SharedPreferences.Editor e = prefs.edit();
        e.putLong(K_HWM, hwm);
        if (firstSeen == 0) { firstSeen = now; e.putLong(K_FIRST_SEEN, now); }
        e.apply();

        // 1) Clock rollback.
        if (storedHwm > 0 && now < storedHwm - CLOCK_SKEW_TOLERANCE_MS) {
            Log.w(TAG, "clock rollback detected -> lock");
            return true;
        }

        // 2) Verify stored lease.
        String lease = prefs.getString(K_LEASE, "");
        JSONObject claims = verifyLease(lease);

        if (claims == null) {
            // No valid lease: allow only during bootstrap grace.
            boolean withinGrace = now <= firstSeen + BOOTSTRAP_GRACE_MS;
            if (withinGrace) return false;
            Log.w(TAG, "no valid lease past bootstrap grace -> lock");
            return true;
        }

        // 3) Enforce lease expiry.
        long exp = claims.optLong("lease_expires_at", 0);
        if (exp <= 0) return true;
        if (now > exp) {
            Log.w(TAG, "lease expired -> lock");
            return true;
        }
        return false; // valid & unexpired
    }

    /** Verify signature + parse claims. Returns null if invalid. */
    private JSONObject verifyLease(String token) {
        if (token == null || token.isEmpty()) return null;
        String[] parts = token.split("\\.");
        if (parts.length != 2) return null;
        try {
            byte[] rawSig = b64urlDecode(parts[1]);
            byte[] der = p1363ToDer(rawSig);

            PublicKey pub = loadPublicKey();
            Signature sig = Signature.getInstance("SHA256withECDSA");
            sig.initVerify(pub);
            sig.update(parts[0].getBytes("UTF-8")); // signed over the base64url payload string
            if (!sig.verify(der)) {
                Log.w(TAG, "lease signature invalid");
                return null;
            }
            String json = new String(b64urlDecode(parts[0]), "UTF-8");
            return new JSONObject(json);
        } catch (Exception e) {
            Log.w(TAG, "lease verify failed: " + e.getMessage());
            return null;
        }
    }

    private PublicKey loadPublicKey() throws Exception {
        byte[] der = Base64.decode(PUBLIC_KEY_SPKI_B64, Base64.DEFAULT);
        KeyFactory kf = KeyFactory.getInstance("EC");
        return kf.generatePublic(new X509EncodedKeySpec(der));
    }

    private static byte[] b64urlDecode(String s) {
        return Base64.decode(s, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    /**
     * Convert a raw IEEE-P1363 ECDSA signature (r||s, fixed width) to the DER
     * SEQUENCE(INTEGER r, INTEGER s) that java.security expects.
     */
    private static byte[] p1363ToDer(byte[] raw) throws Exception {
        int n = raw.length / 2;
        byte[] rBytes = new byte[n];
        byte[] sBytes = new byte[n];
        System.arraycopy(raw, 0, rBytes, 0, n);
        System.arraycopy(raw, n, sBytes, 0, n);
        BigInteger r = new BigInteger(1, rBytes);
        BigInteger s = new BigInteger(1, sBytes);

        byte[] rEnc = encodeDerInteger(r);
        byte[] sEnc = encodeDerInteger(s);
        int seqLen = rEnc.length + sEnc.length;

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0x30); // SEQUENCE
        writeDerLength(out, seqLen);
        out.write(rEnc);
        out.write(sEnc);
        return out.toByteArray();
    }

    private static byte[] encodeDerInteger(BigInteger v) throws Exception {
        byte[] b = v.toByteArray(); // already minimal two's-complement, sign-correct
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0x02); // INTEGER
        writeDerLength(out, b.length);
        out.write(b);
        return out.toByteArray();
    }

    private static void writeDerLength(ByteArrayOutputStream out, int len) {
        if (len < 0x80) {
            out.write(len);
        } else if (len < 0x100) {
            out.write(0x81);
            out.write(len);
        } else {
            out.write(0x82);
            out.write((len >> 8) & 0xff);
            out.write(len & 0xff);
        }
    }
}
