# WhatsApp gateway — production deploy guide

`whatsapp-web.js` drives a real WhatsApp Web browser session. It needs a **persistent, long-running Node.js process** — it cannot run on Vercel, Netlify, or any other serverless/edge platform.

Choose one of the options below.

---

## Option A — Railway (recommended, cheapest)

Railway gives you a persistent container with a free tier and easy deploys from GitHub.

### Steps

1. Go to https://railway.app and create a new project.
2. Click **Deploy from GitHub repo**, select `codearc-restrosuite`, set the root path to `/` (or create a separate repo for the gateway — see note below).
3. Set the **start command**:
   ```
   node whatsapp-gateway.js
   ```
4. Add environment variables in the Railway dashboard:
   ```
   GATEWAY_PORT=3001
   GATEWAY_AUTH_TOKEN=<strong-random-token>
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-secret>
   ```
5. Under **Settings → Networking**, expose port `3001` and copy the generated public URL (e.g. `https://restrosuite-gateway.up.railway.app`).
6. Add this URL to your Vercel environment variables as `WHATSAPP_GATEWAY_URL` so the dashboard knows where to reach it.

> **Tip:** For a cleaner separation, push only `whatsapp-gateway.js`, `package.json`, and `.env.example` to a separate `codearc-gateway` repo and deploy that to Railway.

### First-run QR scan

After deploy, open the Railway service logs. You will see a QR code printed in ASCII. Scan it with your WhatsApp mobile app (**Linked devices → Link a device**). The session is then saved locally and reused on restarts.

---

## Option B — Render

1. Create a new **Web Service** on https://render.com.
2. Connect your GitHub repo, set **Build Command** to `npm install` and **Start Command** to `node whatsapp-gateway.js`.
3. Choose the **Starter** plan (free tier spins down after inactivity — use the **Starter paid** plan, ~$7/mo, for always-on).
4. Add the same environment variables as listed in Option A.
5. Copy the Render public URL for `WHATSAPP_GATEWAY_URL`.

---

## Option C — VPS (DigitalOcean / Hetzner / any Linux box)

```bash
# On your server (Ubuntu 22+)
git clone https://github.com/csheoganj-del/codearc-restrosuite.git
cd codearc-restrosuite
npm install

# Copy and fill environment variables
cp .env.example .env
nano .env

# Install PM2 to keep the process alive
npm install -g pm2

# Start the gateway
pm2 start whatsapp-gateway.js --name restrosuite-gateway

# Save and enable on reboot
pm2 save
pm2 startup

# View logs and scan the QR code
pm2 logs restrosuite-gateway
```

Open port `3001` in your firewall:

```bash
ufw allow 3001/tcp
```

Use **nginx** as a reverse proxy with TLS if you want an HTTPS URL (recommended):

```nginx
server {
    listen 443 ssl;
    server_name gateway.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/gateway.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gateway.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Authentication

Every request from the dashboard to the gateway must include:

```
Authorization: Bearer <GATEWAY_AUTH_TOKEN>
```

The gateway validates this token before processing any request. Set the same `GATEWAY_AUTH_TOKEN` in both the gateway environment and as a Vercel environment variable (`WHATSAPP_GATEWAY_TOKEN`).

---

## Session persistence

`whatsapp-web.js` stores the session in a local `.wwebjs_auth/` directory. On Railway/Render, this directory lives inside the container and is lost on redeploy unless you attach a persistent disk volume.

**Railway:** Under your service, go to **Volumes** and mount a volume at `/app/.wwebjs_auth`.  
**Render:** Add a persistent disk mounted at `/opt/render/project/src/.wwebjs_auth`.  
**VPS:** No action needed — the directory persists on disk naturally.

---

## Re-scanning the QR code

If the session expires or you need to re-link:

1. Delete the `.wwebjs_auth/` directory on the server.
2. Restart the process (`pm2 restart restrosuite-gateway` or redeploy on Railway/Render).
3. Scan the new QR code from the logs.

---

## Monitoring

The gateway exposes a health endpoint:

```
GET /health
→ 200 { status: "ok", whatsapp: "connected" | "initialising" | "disconnected" }
```

You can use Railway's built-in healthcheck or an external uptime monitor (e.g. https://betteruptime.com) pointed at `https://your-gateway-url/health`.