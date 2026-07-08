-- ============================================================
-- Live schema dump — run in Supabase Dashboard → SQL Editor
-- Copy the whole result back so the code can be reconciled
-- against the ACTUAL production columns (not just migrations,
-- which may have drifted).
-- ============================================================

-- One row per table: comma-separated list of its real column names.
SELECT
    table_name,
    string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name LIKE 'doppio_%' OR table_name LIKE 'saas_%' OR table_name LIKE 'tenant_%')
GROUP BY table_name
ORDER BY table_name;

-- OPTIONAL, more detail (name + type + nullability) if you want it:
-- SELECT table_name, column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name LIKE 'doppio_%'
-- ORDER BY table_name, ordinal_position;
