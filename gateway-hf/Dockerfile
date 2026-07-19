# RestroSuite WhatsApp Gateway — Hugging Face Spaces (CPU Basic free: 2 vCPU / 16GB)
# Baileys only (no Chromium) — low RAM, multi-tenant lazy sessions
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Minimal package for gateway only (faster Space builds)
COPY gateway-hf/package.json ./package.json
RUN npm install --omit=dev

COPY whatsapp-gateway.js ./whatsapp-gateway.js

# HF Spaces expects port 7860
ENV PORT=7860
ENV NODE_ENV=production
ENV RESTROSUITE_AUTO_CONNECT_ALL_SESSIONS=false
ENV LAZY_MAX_HOT_TENANTS=30
ENV LAZY_IDLE_MS=180000
ENV LAZY_CONNECT_TIMEOUT_MS=50000
ENV PLATFORM_SEND_FALLBACK=true
ENV AUTH_DATA_PATH=/data/whatsapp-auth

RUN mkdir -p /data/whatsapp-auth /tmp/whatsapp-auth

EXPOSE 7860

# Health: curl optional — HF checks the port
CMD ["node", "whatsapp-gateway.js"]
