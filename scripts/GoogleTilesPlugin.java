package com.apexgolf.caddie;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Native-only key and Android app identity. Images live only in the current view. */
@CapacitorPlugin(name = "GoogleTiles")
public class GoogleTilesPlugin extends Plugin {
    private final ExecutorService network = Executors.newFixedThreadPool(6);
    private String token = "";
    private long expiry = 0;

    private String certificate() throws Exception {
        PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),
            Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 ? info.signingInfo.getApkContentsSigners() : info.signatures;
        byte[] digest = MessageDigest.getInstance("SHA-1").digest(signatures[0].toByteArray());
        StringBuilder hex = new StringBuilder();
        for (byte b : digest) hex.append(String.format(Locale.ROOT, "%02X", b & 255));
        return hex.toString();
    }

    private byte[] fetch(String path, JSONObject query, String body) throws Exception {
        String key = getContext().getString(R.string.google_maps_api_key);
        if (key.isEmpty()) throw new Exception("Google Maps key missing from this build.");
        Uri.Builder uri = new Uri.Builder().scheme("https").authority("tile.googleapis.com").path(path)
            .appendQueryParameter("key", key);
        for (java.util.Iterator<String> i = query.keys(); i.hasNext();) {
            String name = i.next(); uri.appendQueryParameter(name, query.getString(name));
        }
        HttpsURLConnection connection = (HttpsURLConnection) new URL(uri.build().toString()).openConnection();
        try {
            connection.setConnectTimeout(15000); connection.setReadTimeout(15000);
            connection.setUseCaches(false); connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("X-Android-Package", getContext().getPackageName());
            connection.setRequestProperty("X-Android-Cert", certificate());
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (java.io.OutputStream output = connection.getOutputStream()) {
                    output.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            if (status != 200) throw new Exception(status == 403 ? "Google Maps denied access. Check the key and billing." :
                status == 429 ? "Google Maps usage limit reached. Use Map." : "Google Maps unavailable (HTTP " + status + "). Use Map.");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    bytes.write(buffer, 0, count);
                    if (bytes.size() > 4 * 1024 * 1024) throw new Exception("Google Maps response too large.");
                }
                return bytes.toByteArray();
            }
        } finally { connection.disconnect(); }
    }

    private synchronized String session() throws Exception {
        if (!token.isEmpty() && expiry > System.currentTimeMillis() / 1000 + 60) return token;
        JSONObject response = new JSONObject(new String(fetch("/v1/createSession", new JSONObject(),
            "{\"mapType\":\"satellite\",\"language\":\"en-AU\",\"region\":\"AU\",\"imageFormat\":\"jpeg\",\"scale\":\"scaleFactor2x\",\"highDpi\":true}"), StandardCharsets.UTF_8));
        token = response.getString("session"); expiry = response.getLong("expiry"); return token;
    }

    @PluginMethod
    public void request(PluginCall call) {
        network.execute(() -> {
            try {
                String kind = call.getString("kind", "");
                JSONObject query = new JSONObject();
                String path;
                if (kind.equals("tile")) {
                    Integer z = call.getInt("z"), x = call.getInt("x"), y = call.getInt("y");
                    if (z == null || x == null || y == null || z < 0 || z > 22 || x < 0 || y < 0 || x >= (1 << z) || y >= (1 << z))
                        throw new Exception("Invalid satellite coordinates.");
                    path = "/v1/2dtiles/" + z + "/" + x + "/" + y;
                } else if (kind.equals("viewport")) {
                    Integer zoom = call.getInt("zoom");
                    if (zoom == null || zoom < 0 || zoom > 22) throw new Exception("Invalid satellite zoom.");
                    path = "/tile/v1/viewport"; query.put("zoom", zoom.toString());
                    for (String name : new String[]{"north", "south", "east", "west"}) {
                        Double value = call.getDouble(name);
                        double limit = name.equals("north") || name.equals("south") ? 90 : 180;
                        if (value == null || !Double.isFinite(value) || Math.abs(value) >= limit) throw new Exception("Invalid satellite bounds.");
                        query.put(name, value.toString());
                    }
                } else throw new Exception("Unknown Google Maps request.");
                query.put("session", session());
                byte[] bytes = fetch(path, query, null);
                JSObject result = kind.equals("tile") ? new JSObject().put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)) :
                    new JSObject(new String(bytes, StandardCharsets.UTF_8));
                call.resolve(result);
            } catch (Exception error) {
                // Never forward network exception messages: they can contain the key URL.
                String message = error.getMessage();
                call.reject(message != null && (message.startsWith("Google Maps") || message.startsWith("Invalid satellite") || message.startsWith("Unknown Google")) ?
                    message : "Google satellite needs an internet connection. Try again or use Map.");
            }
        });
    }

    @Override
    protected void handleOnDestroy() { network.shutdownNow(); }
}
