package com.restrosuite.pos;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native zero-touch discovery for the local RestroSuite Desktop hub.
 *
 * Browser JavaScript cannot safely enumerate a Wi-Fi subnet. This bridge sends
 * one UDP discovery packet, verifies the outlet session through the desktop,
 * and returns only an authenticated LAN URL/token to the web client.
 */
public final class LanDiscoveryBridge {
    private static final int DISCOVERY_PORT = 39821;
    private static final String DISCOVERY_REQUEST = "RESTROSUITE_LAN_DISCOVER_V1";

    private final WebView webView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean discovering = new AtomicBoolean(false);

    public LanDiscoveryBridge(WebView webView) {
        this.webView = webView;
    }

    @JavascriptInterface
    public void discover(String tenantId, String sessionToken, String existingLanToken) {
        if (tenantId == null || tenantId.trim().isEmpty()) return;
        if (!discovering.compareAndSet(false, true)) return;
        executor.execute(() -> {
            try {
                discoverAndAuthorize(
                        tenantId.trim(),
                        sessionToken == null ? "" : sessionToken,
                        existingLanToken == null ? "" : existingLanToken
                );
            } finally {
                discovering.set(false);
            }
        });
    }

    private void discoverAndAuthorize(String tenantId, String sessionToken, String existingLanToken) {
        byte[] request = DISCOVERY_REQUEST.getBytes(StandardCharsets.UTF_8);
        Set<String> attempted = new HashSet<>();
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true);
            socket.setSoTimeout(350);
            sendDiscovery(socket, request, InetAddress.getByName("255.255.255.255"));
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback()) continue;
                for (InterfaceAddress address : network.getInterfaceAddresses()) {
                    InetAddress broadcast = address.getBroadcast();
                    if (broadcast instanceof Inet4Address) sendDiscovery(socket, request, broadcast);
                }
            }

            long deadline = System.currentTimeMillis() + 1600;
            while (System.currentTimeMillis() < deadline) {
                try {
                    byte[] buffer = new byte[1024];
                    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                    socket.receive(packet);
                    String host = packet.getAddress().getHostAddress();
                    if (!isPrivateAddress(host) || !attempted.add(host)) continue;
                    String message = new String(
                            packet.getData(),
                            packet.getOffset(),
                            packet.getLength(),
                            StandardCharsets.UTF_8
                    );
                    JSONObject discovery = new JSONObject(message);
                    if (!"restrosuite-lan-v1".equals(discovery.optString("service"))) continue;
                    int port = discovery.optInt("port", 0);
                    if (port < 1 || port > 65535) continue;
                    String base = "http://" + host + ":" + port;
                    JSONObject authorized = authorize(
                            host,
                            port,
                            tenantId,
                            sessionToken,
                            existingLanToken
                    );
                    if (authorized != null && authorized.optBoolean("ok")) {
                        JSONObject result = new JSONObject();
                        result.put("base", base);
                        result.put("tenantId", tenantId);
                        result.put("token", authorized.optString("token"));
                        deliver(result.toString());
                        return;
                    }
                } catch (java.net.SocketTimeoutException ignored) {
                    // Continue until the bounded discovery deadline.
                } catch (Exception ignored) {
                    // A different POS or malformed responder cannot interrupt discovery.
                }
            }
        } catch (Exception ignored) {
            // LAN discovery is best effort; cloud and local device storage remain available.
        }
    }

    private void sendDiscovery(DatagramSocket socket, byte[] request, InetAddress address) {
        try {
            socket.send(new DatagramPacket(request, request.length, address, DISCOVERY_PORT));
        } catch (Exception ignored) {}
    }

    private JSONObject authorize(
            String host,
            int port,
            String tenantId,
            String sessionToken,
            String existingLanToken
    ) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 900);
            socket.setSoTimeout(1800);
            JSONObject body = new JSONObject();
            body.put("tenantId", tenantId);
            body.put("sessionToken", sessionToken);
            body.put("lanToken", existingLanToken);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            String headers =
                    "POST /api/lan/auto-pair HTTP/1.1\r\n"
                            + "Host: " + host + ":" + port + "\r\n"
                            + "Content-Type: application/json\r\n"
                            + "Cache-Control: no-store\r\n"
                            + "Connection: close\r\n"
                            + "Content-Length: " + bytes.length + "\r\n\r\n";
            OutputStream output = socket.getOutputStream();
            output.write(headers.getBytes(StandardCharsets.US_ASCII));
            output.write(bytes);
            output.flush();

            ByteArrayOutputStream response = new ByteArrayOutputStream();
            InputStream input = socket.getInputStream();
            byte[] buffer = new byte[2048];
            int count;
            while ((count = input.read(buffer)) > 0 && response.size() < 16384) {
                response.write(buffer, 0, count);
            }
            String text = response.toString(StandardCharsets.UTF_8.name());
            int split = text.indexOf("\r\n\r\n");
            if (split < 0 || !text.startsWith("HTTP/1.1 200")) return null;
            return new JSONObject(text.substring(split + 4));
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean isPrivateAddress(String host) {
        if (host == null) return false;
        if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
        if (!host.startsWith("172.")) return false;
        String[] parts = host.split("\\.");
        if (parts.length != 4) return false;
        try {
            int second = Integer.parseInt(parts[1]);
            return second >= 16 && second <= 31;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    private void deliver(String json) {
        webView.post(() -> webView.evaluateJavascript(
                "if(window.RSLanSync&&window.RSLanSync.acceptNativeHub){"
                        + "window.RSLanSync.acceptNativeHub(" + JSONObject.quote(json) + ");}",
                null
        ));
    }

    public void shutdown() {
        executor.shutdownNow();
    }
}
