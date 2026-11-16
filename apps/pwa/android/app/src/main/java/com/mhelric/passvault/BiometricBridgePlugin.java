package com.mhelric.passvault;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "NativeBiometric")
public class BiometricBridgePlugin extends Plugin {
    private static final String KEYSTORE_ALIAS = "passvault_biometric_key_v1";
    private static final String PREFS_NAME = "passvault_bio_prefs";
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_STRONG
            | BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        int status = manager.canAuthenticate(AUTHENTICATORS);
        JSObject ret = new JSObject();
        ret.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void enroll(PluginCall call) {
        String userId = call.getString("userId");
        String secretB64 = call.getString("secretB64");
        if (userId == null || userId.isEmpty() || secretB64 == null || secretB64.isEmpty()) {
            call.reject("Missing userId or secretB64");
            return;
        }

        showPrompt(
            "Enable Biometric Unlock",
            "Verify your fingerprint or face to enable quick unlock",
            call,
            new Runnable() {
                @Override
                public void run() {
                    try {
                        String sealed = sealSecret(secretB64);
                        SharedPreferences prefs =
                            getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                        prefs.edit().putString("bio_" + userId, sealed).apply();
                        JSObject ret = new JSObject();
                        ret.put("enrolled", true);
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("Failed to store biometric key: " + e.getMessage());
                    }
                }
            }
        );
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String userId = call.getString("userId");
        if (userId == null || userId.isEmpty()) {
            call.reject("Missing userId");
            return;
        }

        SharedPreferences prefs =
            getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String sealed = prefs.getString("bio_" + userId, null);
        if (sealed == null) {
            call.reject("Biometrics not enrolled on this device. Unlock with PIN or Master Password and re-enable in Security & Settings.");
            return;
        }

        showPrompt(
            "Unlock Pass-Vault",
            "Authenticate with fingerprint or face to decrypt your vault",
            call,
            new Runnable() {
                @Override
                public void run() {
                    try {
                        String secretB64 = unsealSecret(sealed);
                        JSObject ret = new JSObject();
                        ret.put("secretB64", secretB64);
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("Failed to decrypt biometric key: " + e.getMessage());
                    }
                }
            }
        );
    }

    private void showPrompt(String title, String subtitle, PluginCall call, Runnable onSuccess) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }

        getActivity().runOnUiThread(() -> {
            BiometricManager manager = BiometricManager.from(getContext());
            if (manager.canAuthenticate(AUTHENTICATORS) != BiometricManager.BIOMETRIC_SUCCESS) {
                call.reject("No fingerprint or face biometrics configured on this device.");
                return;
            }

            BiometricPrompt prompt = new BiometricPrompt(
                getActivity(),
                ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(
                        @NonNull BiometricPrompt.AuthenticationResult result
                    ) {
                        onSuccess.run();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        call.reject(errString.toString());
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // System prompt remains open for retry
                    }
                }
            );

            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setNegativeButtonText("Use PIN / Password")
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build();

            prompt.authenticate(promptInfo);
        });
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEYSTORE_ALIAS)) {
            return (SecretKey) ks.getKey(KEYSTORE_ALIAS, null);
        }
        KeyGenerator generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    private String sealSecret(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP)
            + ":"
            + Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private String unsealSecret(String payload) throws Exception {
        String[] parts = payload.split(":", 2);
        if (parts.length != 2) {
            throw new IllegalArgumentException("Corrupted biometric payload");
        }
        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        byte[] plain = cipher.doFinal(encrypted);
        return new String(plain, StandardCharsets.UTF_8);
    }
}
