-- =============================================================================
-- FIFA Fantasy Predictor — Core Schema
-- =============================================================================
-- Run this in the Supabase SQL Editor (or via `supabase db push`) on a fresh
-- project. Designed to be idempotent-ish (uses IF NOT EXISTS / OR REPLACE
-- where practical) so it can be re-run safely during setup.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Roles
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'user');
  end if;
end$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Security-definer helper so RLS policies can check "is this user an admin?"
-- without triggering recursive RLS lookups on user_roles itself.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin');
$$;

-- -----------------------------------------------------------------------------
-- 2. Profiles (one row per auth.users row)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Auto-provision profile + role on signup
-- -----------------------------------------------------------------------------
-- IMPORTANT: change this email if you want a different account to be the
-- initial admin. It only fires once per matching signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  if lower(new.email) = lower('saiflegend4321@gmail.com') then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 4. Teams (48 World Cup 2026 nations)
-- -----------------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fifa_code text unique,            -- e.g. 'BRA', 'ARG'
  flag_emoji text,
  group_name text,                  -- e.g. 'Group A' — filled in once the draw is known
  external_id text unique,          -- TheSportsDB idTeam, for safe upserts during sync
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. Fixtures
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'fixture_status') then
    create type public.fixture_status as enum ('scheduled', 'live', 'finished', 'postponed');
  end if;
end$$;

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,          -- TheSportsDB idEvent, for safe upserts during sync
  round text,                       -- e.g. 'Group A', 'Round of 16', 'Final'
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  kickoff_at timestamptz not null,
  venue text,
  status public.fixture_status not null default 'scheduled',

  -- Regulation/extra-time score ONLY. Penalty shootout goals are never stored
  -- here, by design — see went_to_penalties + penalty_home_score below.
  home_score integer,
  away_score integer,

  went_to_penalties boolean not null default false,
  penalty_home_score integer,       -- informational only, NEVER used in scoring
  penalty_away_score integer,       -- informational only, NEVER used in scoring

  scored_at timestamptz,            -- set when scoring was last (re)computed for this fixture

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint different_teams check (home_team_id <> away_team_id),
  constraint scores_set_together check (
    (home_score is null and away_score is null) or
    (home_score is not null and away_score is not null)
  )
);

create index if not exists idx_fixtures_kickoff on public.fixtures (kickoff_at);
create index if not exists idx_fixtures_status on public.fixtures (status);

-- -----------------------------------------------------------------------------
-- 6. User's two favourite teams (locked once tournament starts — enforced in app/RLS below)
-- -----------------------------------------------------------------------------
create table if not exists public.user_favourite_teams (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_a_id uuid not null references public.teams(id),
  team_b_id uuid not null references public.teams(id),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint different_favourites check (team_a_id <> team_b_id)
);

-- -----------------------------------------------------------------------------
-- 7. Predictions
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'prediction_outcome') then
    create type public.prediction_outcome as enum ('home_win', 'away_win', 'draw');
  end if;
end$$;

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  predicted_outcome public.prediction_outcome not null,

  -- Snapshot of which favourite tier this pick corresponds to, captured at
  -- prediction time so scoring is stable even if a user's favourites later
  -- change (favourites are normally locked, but this keeps history correct
  -- regardless). 'primary' = 6pt tier, 'secondary' = 3pt tier, null = free pick.
  favourite_tier text check (favourite_tier in ('primary', 'secondary')),

  points_awarded integer,           -- null until the fixture is scored
  goals_bonus integer,               -- the "plus goals" portion, broken out for transparency

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, fixture_id)
);

create index if not exists idx_predictions_user on public.predictions (user_id);
create index if not exists idx_predictions_fixture on public.predictions (fixture_id);

-- -----------------------------------------------------------------------------
-- 8. updated_at maintenance trigger (generic, reused across tables)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_fixtures_updated_at on public.fixtures;
create trigger trg_fixtures_updated_at before update on public.fixtures
  for each row execute function public.set_updated_at();

drop trigger if exists trg_favourites_updated_at on public.user_favourite_teams;
create trigger trg_favourites_updated_at before update on public.user_favourite_teams
  for each row execute function public.set_updated_at();

drop trigger if exists trg_predictions_updated_at on public.predictions;
create trigger trg_predictions_updated_at before update on public.predictions
  for each row execute function public.set_updated_at();
