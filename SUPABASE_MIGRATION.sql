-- ============================================================
-- PERIOD TRACKER - COMPLETE DATABASE SETUP
-- This script is safe to run multiple times
-- ============================================================

-- Step 1: Clean up existing structures (safe even if they don't exist)
DROP TABLE IF EXISTS period_entries CASCADE;
DROP TABLE IF EXISTS monthly_insights CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Step 2: Create period_entries table
CREATE TABLE period_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz,
  status text DEFAULT 'active',
  flow text,
  symptoms text[],
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  ended_by timestamptz
);

-- Step 3: Create monthly_insights table
CREATE TABLE monthly_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,
  insight_json jsonb,
  generated_at timestamptz DEFAULT now()
);

-- Step 4: Create indexes
CREATE INDEX idx_period_entries_status ON period_entries(status);
CREATE INDEX idx_period_entries_start ON period_entries(start_datetime DESC);
CREATE INDEX idx_monthly_insights_month ON monthly_insights(month);

-- Step 5: Enable Row Level Security
ALTER TABLE period_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_insights ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS Policies for period_entries
CREATE POLICY "allow_select_period_entries" ON period_entries FOR SELECT USING (true);
CREATE POLICY "allow_insert_period_entries" ON period_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update_period_entries" ON period_entries FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_period_entries" ON period_entries FOR DELETE USING (true);

-- Step 7: Create RLS Policies for monthly_insights
CREATE POLICY "allow_select_monthly_insights" ON monthly_insights FOR SELECT USING (true);
CREATE POLICY "allow_insert_monthly_insights" ON monthly_insights FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update_monthly_insights" ON monthly_insights FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_monthly_insights" ON monthly_insights FOR DELETE USING (true);

-- Step 8: Enable Realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE period_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE monthly_insights;

-- Step 9: Create auto-update trigger function
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create triggers
CREATE TRIGGER update_period_entries_updated_at
  BEFORE UPDATE ON period_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monthly_insights_updated_at
  BEFORE UPDATE ON monthly_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SUCCESS! Database is ready for the Period Tracker app.
-- ============================================================

-- Daily logs table: supports the Today check-in, intercourse, exercise and medication logging
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date date NOT NULL,
  log_type text NOT NULL DEFAULT 'daily' CHECK (log_type IN ('daily', 'intercourse', 'exercise', 'medication')),
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

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_logs_full_access" ON public.daily_logs;
CREATE POLICY "daily_logs_full_access" ON public.daily_logs
  FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'daily_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_logs;
  END IF;
END $$;
