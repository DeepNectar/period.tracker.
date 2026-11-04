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

-- Enable RLS (same open-access policy style as period_entries for this anon-key app)
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_logs_full_access" ON public.daily_logs;
CREATE POLICY "daily_logs_full_access" ON public.daily_logs
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'daily_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_logs;
  END IF;
END $$;
