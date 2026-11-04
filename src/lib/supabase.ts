import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Prefer environment variables (set these in Vercel / .env for production):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://pxnaqqjhubraemjpoour.supabase.co';
const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4bmFxcWpodWJyYWVtanBvb3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMzk0NDksImV4cCI6MjEwODkxNTQ0OX0.Sw5VKBLSTwC8drw3WgFo4IpH3xZ1uFhwgfXYHd5gacQ';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

export type PeriodEntry = {
  id: string;
  user_id?: string | null;
  start_datetime: string;
  end_datetime: string | null;
  status: 'active' | 'completed';
  flow: 'Light' | 'Medium' | 'Heavy' | null;
  symptoms: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ended_by: string | null;
};

export type MonthlyInsight = {
  id: string;
  month: string;
  insight_json: Record<string, any>;
  generated_at: string;
};

// ---------- Shared types for new tables ----------
export type DailyLogRow = {
  id: string;
  user_id: string | null;
  log_date: string;
  log_type: string;
  flow: string | null;
  symptoms: string[] | null;
  moods: string[] | null;
  pain_intensity: string | null;
  discharge: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPrefRow = {
  user_id: string;
  prefs: Record<string, any>;
  updated_at: string;
};

export type ShareTokenRow = {
  id: string;
  user_id: string;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
};
