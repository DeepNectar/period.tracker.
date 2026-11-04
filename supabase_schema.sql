-- Run this in Supabase -> SQL Editor to enable cloud sync.
create table if not exists public.period_logs (
  id bigint generated always as identity primary key,
  log_date date not null unique,
  created_at timestamptz not null default now()
);

alter table public.period_logs enable row level security;

-- Simple policy for demo use. Tighten with an auth user_id column for production.
create policy "public read"  on public.period_logs for select using (true);
create policy "public insert" on public.period_logs for insert with check (true);
create policy "public delete" on public.period_logs for delete using (true);
