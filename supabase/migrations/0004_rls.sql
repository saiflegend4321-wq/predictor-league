-- =============================================================================
-- FIFA Fantasy Predictor — Row Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.teams enable row level security;
alter table public.fixtures enable row level security;
alter table public.user_favourite_teams enable row level security;
alter table public.predictions enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using (true); -- public display names visible to everyone (needed for leaderboard)

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- user_roles — only admins can read/write the roles table; users never need to
-- query it directly (use the is_admin() helper from the client only via RPC
-- if ever needed — normally the frontend just trusts the JWT-derived session).
-- -----------------------------------------------------------------------------
drop policy if exists "user_roles_select_own_or_admin" on public.user_roles;
create policy "user_roles_select_own_or_admin"
  on public.user_roles for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_roles_admin_manage" on public.user_roles;
create policy "user_roles_admin_manage"
  on public.user_roles for all
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- teams — readable by everyone, writable only by admins
-- -----------------------------------------------------------------------------
drop policy if exists "teams_select_all" on public.teams;
create policy "teams_select_all"
  on public.teams for select
  using (true);

drop policy if exists "teams_admin_write" on public.teams;
create policy "teams_admin_write"
  on public.teams for all
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- fixtures — readable by everyone, writable only by admins
-- -----------------------------------------------------------------------------
drop policy if exists "fixtures_select_all" on public.fixtures;
create policy "fixtures_select_all"
  on public.fixtures for select
  using (true);

drop policy if exists "fixtures_admin_write" on public.fixtures;
create policy "fixtures_admin_write"
  on public.fixtures for all
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- user_favourite_teams — users manage their own row only; everyone can read
-- (needed so other users can see "Alice supports Brazil & Germany" if you
-- want that on profiles/leaderboard; harmless either way).
-- -----------------------------------------------------------------------------
drop policy if exists "favourites_select_all" on public.user_favourite_teams;
create policy "favourites_select_all"
  on public.user_favourite_teams for select
  using (true);

drop policy if exists "favourites_insert_own" on public.user_favourite_teams;
create policy "favourites_insert_own"
  on public.user_favourite_teams for insert
  with check (auth.uid() = user_id);

drop policy if exists "favourites_update_own_unlocked" on public.user_favourite_teams;
create policy "favourites_update_own_unlocked"
  on public.user_favourite_teams for update
  using (auth.uid() = user_id and locked = false)
  with check (auth.uid() = user_id);

drop policy if exists "favourites_admin_manage" on public.user_favourite_teams;
create policy "favourites_admin_manage"
  on public.user_favourite_teams for all
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- predictions — users manage only their own; everyone can read everyone's
-- predictions (transparency — needed for any "who picked what" UI, and
-- harmless since this is a friendly league, not betting). Tighten to
-- "own only" select if you'd prefer predictions to stay private until kickoff.
-- -----------------------------------------------------------------------------
drop policy if exists "predictions_select_all" on public.predictions;
create policy "predictions_select_all"
  on public.predictions for select
  using (true);

drop policy if exists "predictions_insert_own" on public.predictions;
create policy "predictions_insert_own"
  on public.predictions for insert
  with check (auth.uid() = user_id);

drop policy if exists "predictions_update_own" on public.predictions;
create policy "predictions_update_own"
  on public.predictions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "predictions_delete_own" on public.predictions;
create policy "predictions_delete_own"
  on public.predictions for delete
  using (auth.uid() = user_id);

drop policy if exists "predictions_admin_manage" on public.predictions;
create policy "predictions_admin_manage"
  on public.predictions for all
  using (public.is_admin())
  with check (public.is_admin());
