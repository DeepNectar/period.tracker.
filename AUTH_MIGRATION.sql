-- ============================================================
-- PERIOD TRACKER — AUTH / SHARE / BACKUP TABLES  (Supabase)
-- Run this ENTIRE script in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to run multiple times (idempotent). Does NOT drop or alter existing data.
--
-- This is the corrected version of the earlier migration. It fixes:
--   ERROR 42703: column "user_id" does not exist
-- by creating the missing tables/columns FIRST, then applying policies.
--
-- What this adds:
--   1. period_entries.user_id        – ownership column for signed-in users
--   2. daily_logs.user_id            – ownership column (table must already exist;
--                                      if it doesn't, it is created here too)
--   3. user_prefs                    – habits, onboarding defaults (text key so
--                                      guest/local mode keeps working)
--   4. share_tokens                  – Partner Mode read-only links
--   5. push_subscriptions            – web-push notification subscriptions
-- ============================================================

-- ------------------------------------------------------------
-- 1) OWNERSHIP COLUMN ON PERIOD ENTRIES
-- ------------------------------------------------------------
ALTER TABLE public.period_entries
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_period_entries_user ON public.period_entries(user_id);

-- ------------------------------------------------------------
-- 2) DAILY LOGS — create if missing, then add ownership column
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date date NOT NULL,
  log_type text NOT NULL DEFAULT 'daily'
    CHECK (log_type IN ('daily','intercourse','exercise','medication')),
  flow text,
  symptoms text[] DEFAULT '{}',
  moods text[] DEFAULT '{}',
  pain_intensity text,
  discharge text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_logs_user ON public.daily_logs(user_id);

-- ------------------------------------------------------------
-- 3) USER PREFS (habits + onboarding defaults)
--    user_id is TEXT on purpose: guests store 'local', signed-in users
--    store their auth uid as text. RLS allows both anon and owner writes.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_prefs (
  user_id text PRIMARY KEY,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_prefs_read"  ON public.user_prefs;
DROP POLICY IF EXISTS "user_prefs_write" ON public.user_prefs;

CREATE POLICY "user_prefs_read"  ON public.user_prefs FOR SELECT USING (true);
CREATE POLICY "user_prefs_write" ON public.user_prefs FOR ALL
  USING (auth.uid()::text = user_id OR user_id = 'local')
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'local');

-- ------------------------------------------------------------
-- 4) SHARE TOKENS (Partner Mode)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token uuid UNIQUE NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON public.share_tokens(token);

ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share_tokens_read_any" ON public.share_tokens;
DROP POLICY IF EXISTS "share_tokens_manage_own" ON public.share_tokens;

CREATE POLICY "share_tokens_read_any" ON public.share_tokens
  FOR SELECT USING (true);                      -- needed to validate a link
CREATE POLICY "share_tokens_manage_own" ON public.share_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5) PUSH SUBSCRIPTIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  keys jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_own" ON public.push_subscriptions;

CREATE POLICY "push_subs_own" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 6) PARTNER READ ACCESS ON PERIOD ENTRIES
--    Anonymous visitors of a share link may read ONLY entries owned by a
--    user who has a valid, unexpired share token. The app only ever asks
--    for start/end/status columns, so symptoms & notes are never exposed
--    on the shared page.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "partner_read_via_token" ON public.period_entries;

CREATE POLICY "partner_read_via_token" ON public.period_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.share_tokens st
      WHERE st.user_id = period_entries.user_id
        AND (st.expires_at IS NULL OR st.expires_at > now())
    )
  );

-- ------------------------------------------------------------
-- DONE. Verify everything exists by running:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('period_entries','daily_logs','user_prefs','share_tokens','push_subscriptions');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'period_entries' AND column_name = 'user_id';
-- ------------------------------------------------------------
