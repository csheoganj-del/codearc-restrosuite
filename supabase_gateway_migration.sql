-- ============================================================
-- Gateway Health Log Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create gateway_health_log table to store all gateway events
CREATE TABLE IF NOT EXISTS public.gateway_health_log (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event       text NOT NULL,        -- 'connected', 'disconnected', 'qr_needed', 'reconnecting', 'session_saved', 'session_restored', 'alert_sent', 'startup'
    status      text,                 -- 'ok', 'warning', 'error'
    details     jsonb DEFAULT '{}'::jsonb,   -- extra context: error message, attempt count, phone number, etc.
    created_at  timestamptz DEFAULT now()
);

-- Disable RLS so gateway (service key) can insert freely
ALTER TABLE public.gateway_health_log DISABLE ROW LEVEL SECURITY;

-- Index for fast recent queries
CREATE INDEX IF NOT EXISTS idx_gateway_health_log_created_at
    ON public.gateway_health_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_health_log_event
    ON public.gateway_health_log (event);


-- ============================================================
-- 2. Enable Realtime for gateway_health_log (optional - for live dashboard)
-- ============================================================
ALTER TABLE public.gateway_health_log REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'gateway_health_log'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_health_log;
    END IF;
END $$;


-- ============================================================
-- 3. Create Supabase Storage bucket for WhatsApp session
--    Run this ONLY if you can't create bucket from Supabase Dashboard UI
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'whatsapp-session',
    'whatsapp-session',
    false,             -- PRIVATE bucket (important for security)
    52428800,          -- 50 MB limit
    ARRAY['application/zip', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow service_role full access (gateway uses service key)
CREATE POLICY "Service role full access to whatsapp-session"
ON storage.objects
FOR ALL
USING (bucket_id = 'whatsapp-session' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'whatsapp-session' AND auth.role() = 'service_role');
