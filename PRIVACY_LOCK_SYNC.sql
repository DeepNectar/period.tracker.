-- Privacy Lock: cross-device sync via user_prefs.
-- The PIN is NEVER stored — only a PBKDF2-SHA256 hash + random salt, kept in
-- the `prefs` JSONB column under key 'privacy_lock'. Enabling the lock on one
-- device makes every device signed into the same account require that PIN.

-- Ensure the user_prefs table exists (idempotent). Schema matches
-- AUTH_MIGRATION.sql: user_id is TEXT (auth uid as text; guests use 'local'),
-- and existing RLS policies already allow owners to read/write their row.
CREATE TABLE IF NOT EXISTS public.user_prefs (
  user_id text PRIMARY KEY,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;

-- Keep the same policies as AUTH_MIGRATION.sql (safe to re-run).
DROP POLICY IF EXISTS "user_prefs_read"  ON public.user_prefs;
DROP POLICY IF EXISTS "user_prefs_write" ON public.user_prefs;

CREATE POLICY "user_prefs_read"  ON public.user_prefs FOR SELECT USING (true);
CREATE POLICY "user_prefs_write" ON public.user_prefs FOR ALL
  USING (auth.uid()::text = user_id OR user_id = 'local')
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'local');

-- ------------------------------------------------------------
-- Realtime: lets every device receive instant updates when the
-- privacy lock is enabled/disabled on another device.
-- (Without this, other devices only learn about the change when
-- they next refresh on focus/visibility.)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_prefs'
  ) THEN
    ALTER TABLE public.user_prefs REPLICA IDENTITY FULL;
  END IF;
END $$;

-- Add user_prefs to the supabase_realtime publication (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_prefs'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_prefs;
    EXCEPTION WHEN others THEN
      -- publication may not exist; create it with this table
      CREATE PUBLICATION supabase_realtime;
    END;
  END IF;
END $$;

-- ------------------------------------------------------------
-- v2: "This data belongs to <name>" — the display name is stored
-- inside the same prefs JSONB (privacy_lock.owner_name) and in
-- Supabase auth metadata, so NO new table/columns are required.
-- Re-running this whole file is safe (idempotent).
-- ------------------------------------------------------------
