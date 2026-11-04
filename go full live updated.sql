-- ============================================================
-- PERIOD TRACKER — COMPLETE GO-LIVE DATABASE SETUP (Supabase)
-- Run this ENTIRE script in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to run multiple times (idempotent). Does NOT drop your existing data.
--
-- Tables created / upgraded:
--   1. period_entries     – periods (start/end, flow, symptoms, notes) + realtime sync
--   2. monthly_insights   – cached AI-style insights per month
--   3. daily_logs         – per-day check-ins: flow, symptoms, moods, pain, discharge,
--                           intercourse, exercise, medication  (feeds Calendar dots & Today screen)
--   4. bbt_readings       – basal body temperature readings (syncs the BBT tool across devices)
--   5. user_settings      – cycle length preference, default luteal offset, due-date overrides
--
-- The app auto-fills "first day of last period" and the Cycle Length Calculator
-- directly from period_entries — no extra table needed for that.
-- ============================================================

-- ------------------------------------------------------------
-- 1) PERIOD ENTRIES (created if missing; existing data preserved)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.period_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_datetime timestamptz NOT NULL,          -- first day of the period (auto-feeds all calculators)
  end_datetime timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  flow text,                                     -- Light | Medium | Heavy | Spotting
  symptoms text[] DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_by timestamptz
);

-- Add columns if you're upgrading an older schema (no-ops when present)
ALTER TABLE public.period_entries ADD COLUMN IF NOT EXISTS symptoms text[] DEFAULT '{}';
ALTER TABLE public.period_entries ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.period_entries ADD COLUMN IF NOT EXISTS ended_by timestamptz;

CREATE INDEX IF NOT EXISTS idx_period_entries_status ON public.period_entries(status);
CREATE INDEX IF NOT EXISTS idx_period_entries_start  ON public.period_entries(start_datetime DESC);

ALTER TABLE public.period_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_select_period_entries"  ON public.period_entries;
DROP POLICY IF EXISTS "allow_insert_period_entries"  ON public.period_entries;
DROP POLICY IF EXISTS "allow_update_period_entries"  ON public.period_entries;
DROP POLICY IF EXISTS "allow_delete_period_entries"  ON public.period_entries;

CREATE POLICY "allow_select_period_entries" ON public.period_entries FOR SELECT USING (true);
CREATE POLICY "allow_insert_period_entries" ON public.period_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update_period_entries" ON public.period_entries FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_period_entries" ON public.period_entries FOR DELETE USING (true);

-- ------------------------------------------------------------
-- 2) MONTHLY INSIGHTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,                    -- e.g. "2026-10"
  insight_json jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_insights_month ON public.monthly_insights(month);

ALTER TABLE public.monthly_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_select_monthly_insights" ON public.monthly_insights;
DROP POLICY IF EXISTS "allow_write_monthly_insights"  ON public.monthly_insights;

CREATE POLICY "allow_select_monthly_insights" ON public.monthly_insights FOR SELECT USING (true);
CREATE POLICY "allow_write_monthly_insights"  ON public.monthly_insights FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3) DAILY LOGS (Today check-in, calendar day logs, intercourse/exercise/medication)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date date NOT NULL,                        -- local day key yyyy-MM-dd
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

CREATE INDEX IF NOT EXISTS daily_logs_log_date_idx ON public.daily_logs (log_date);
CREATE INDEX IF NOT EXISTS daily_logs_type_idx    ON public.daily_logs (log_type);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_logs_full_access" ON public.daily_logs;
CREATE POLICY "daily_logs_full_access" ON public.daily_logs
  FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 4) BBT READINGS (Basal Body Temperature — syncs the BBT tool across devices)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bbt_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_date date NOT NULL UNIQUE,             -- one reading per day
  temperature numeric(4,2) NOT NULL CHECK (temperature > 30 AND temperature < 110),
  unit text NOT NULL DEFAULT 'F' CHECK (unit IN ('F','C')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bbt_readings_date_idx ON public.bbt_readings (reading_date);

ALTER TABLE public.bbt_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bbt_full_access" ON public.bbt_readings;
CREATE POLICY "bbt_full_access" ON public.bbt_readings
  FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 5) USER SETTINGS (single-row settings document)
--    avg_cycle_length : fallback used by ovulation/due-date tools before enough data exists
--    luteal_offset    : days before next period that ovulation occurs (default 14)
--    manual_lmp_date  : optional override for "first day of last period";
--                       when NULL the app auto-fills from period_entries
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  avg_cycle_length int NOT NULL DEFAULT 28 CHECK (avg_cycle_length BETWEEN 15 AND 60),
  luteal_offset int NOT NULL DEFAULT 14 CHECK (luteal_offset BETWEEN 10 AND 16),
  manual_lmp_date date,
  default_flow text,
  reminders_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.user_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_full_access" ON public.user_settings;
CREATE POLICY "settings_full_access" ON public.user_settings
  FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- AUTO-UPDATE updated_at TRIGGERS (safe to re-run)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['period_entries','daily_logs','bbt_readings','user_settings'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'set_updated_at_' || t AND tgrelid = ('public.' || t)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- REALTIME SYNC — every table below pushes live changes to all open app tabs/devices
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['period_entries','monthly_insights','daily_logs','bbt_readings','user_settings'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- HELPFUL VIEWS (optional — handy in the Table Editor / debugging)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_last_period AS
SELECT COALESCE(
  (SELECT start_datetime FROM period_entries WHERE status = 'active' ORDER BY start_datetime DESC LIMIT 1),
  (SELECT start_datetime FROM period_entries ORDER BY start_datetime DESC LIMIT 1)
) AS last_period_start;

CREATE OR REPLACE VIEW public.v_cycle_lengths AS
WITH starts AS (
  SELECT start_datetime::date AS d,
         LAG(start_datetime::date) OVER (ORDER BY start_datetime) AS prev_d
  FROM period_entries
)
SELECT d AS period_start, prev_d AS previous_start, (d - prev_d) AS cycle_length_days
FROM starts WHERE prev_d IS NOT NULL AND (d - prev_d) BETWEEN 15 AND 60
ORDER BY d DESC;

-- Done ✅ — reload the app. Periods, daily logs, BBT readings and settings now sync in realtime,
-- and every calculator that needs "first day of last period" (Due Date, Ovulation, Predictions)
-- plus the Cycle Length Calculator pull automatically from period_entries.
