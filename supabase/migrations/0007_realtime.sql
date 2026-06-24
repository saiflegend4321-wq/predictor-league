-- =============================================================================
-- Migration 0007: group_label column + Supabase Realtime
-- =============================================================================

-- Add group_label to fixtures (e.g. "Group A", "Group B", knockout rounds)
alter table public.fixtures
  add column if not exists group_label text;

-- Enable Supabase Realtime publications so connected browsers get live updates
-- the instant a row changes (fixture score entered, prediction saved, etc.)
-- Note: Supabase already creates a "supabase_realtime" publication — we just
-- need to add our tables to it. This is idempotent on re-run.

do $$
begin
  -- fixtures (live score updates push instantly to Fixtures page)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'fixtures'
  ) then
    alter publication supabase_realtime add table public.fixtures;
  end if;

  -- predictions (user's own picks update in real-time)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'predictions'
  ) then
    alter publication supabase_realtime add table public.predictions;
  end if;

  -- leaderboard changes (points recalculate live)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end$$;
