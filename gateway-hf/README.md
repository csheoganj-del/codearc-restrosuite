---
title: RestroSuite WhatsApp Gateway
emoji: 🍽️
colorFrom: orange
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# RestroSuite WhatsApp Gateway (Baileys)

Free-tier friendly Docker Space for multi-tenant **lazy** WhatsApp automation.

## Secrets (Space → Settings → Variables and secrets)

| Name | Required | Description |
|------|----------|-------------|
| `GATEWAY_TOKEN` | yes | Same as dashboard / Supabase `WHATSAPP_GATEWAY_TOKEN` |
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role (session zip backup) |
| `GATEWAY_ALLOWED_ORIGINS` | recommended | `https://restrosuite.codearc.co.in,https://*.vercel.app` |
| `LAZY_MAX_HOT_TENANTS` | no | default `30` |
| `RESTROSUITE_AUTO_CONNECT_ALL_SESSIONS` | no | keep `false` |

## After deploy

1. Open `https://YOUR_USER-YOUR_SPACE.hf.space/health`
2. Superadmin → Gateway → scan QR once
3. Set Supabase secret `WHATSAPP_GATEWAY_URL` to that Space URL
