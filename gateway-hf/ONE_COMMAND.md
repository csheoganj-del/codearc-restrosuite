# Deploy WhatsApp Gateway to Hugging Face (one shot)

## 1. Get a token (30 seconds)

1. Open https://huggingface.co/settings/tokens?new_token=true  
2. Create token with **Write** permission  
3. Copy `hf_...`

## 2. Add to project

In `.env.local` add:

```env
HF_TOKEN=hf_xxxxxxxx
```

## 3. Deploy

```powershell
cd "C:\Users\MASTER PC\Downloads\restrosuite"
.\scripts\deploy-hf-gateway.ps1
```

Or:

```powershell
$env:HF_TOKEN = "hf_xxxxxxxx"
.\scripts\deploy-hf-gateway.ps1 -HfUser "kalpeshdeora1006" -SpaceName "restrosuite-gateway"
```

## 4. After green health

| Step | Action |
|------|--------|
| URL | `https://kalpeshdeora1006-restrosuite-gateway.hf.space` |
| Supabase secret | `WHATSAPP_GATEWAY_URL` = that URL |
| Supabase secret | `WHATSAPP_GATEWAY_TOKEN` = same as `GATEWAY_TOKEN` |
| Superadmin | Gateway → scan QR once |
| Clients | Settings → WhatsApp → scan once (lazy own number) |

## Hardware

Free **CPU Basic**: 2 vCPU / **16 GB RAM** — enough for lazy multi-tenant Baileys.
