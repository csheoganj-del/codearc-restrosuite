CREATE TABLE IF NOT EXISTS public.api_rate_limits (
    bucket text PRIMARY KEY,
    window_started_at timestamp with time zone NOT NULL DEFAULT now(),
    request_count integer NOT NULL DEFAULT 0,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
    p_bucket text,
    p_limit integer,
    p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count integer;
BEGIN
    IF p_bucket IS NULL OR p_bucket = '' OR p_limit < 1 OR p_window_seconds < 1 THEN
        RETURN false;
    END IF;

    INSERT INTO public.api_rate_limits AS limits (
        bucket,
        window_started_at,
        request_count,
        updated_at
    )
    VALUES (p_bucket, now(), 1, now())
    ON CONFLICT (bucket) DO UPDATE
    SET
        window_started_at = CASE
            WHEN limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
            THEN now()
            ELSE limits.window_started_at
        END,
        request_count = CASE
            WHEN limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
            THEN 1
            ELSE limits.request_count + 1
        END,
        updated_at = now()
    RETURNING request_count INTO current_count;

    RETURN current_count <= p_limit;
END;
$$;

REVOKE ALL ON TABLE public.api_rate_limits FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, integer, integer) TO service_role;
