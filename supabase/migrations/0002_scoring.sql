-- =============================================================================
-- FIFA Fantasy Predictor — Scoring Engine
-- =============================================================================
-- Implements the locked-down scoring rules:
--
--   Per prediction on a FINISHED fixture (regulation/ET score only — penalty
--   shootout goals are never read, by construction: home_score/away_score
--   never include them):
--
--   1. User predicted the winning team, and that team is their PRIMARY
--      favourite (slot 'team_a')                        -> 6 pts + goals scored by that team
--   2. User predicted the winning team, and that team is their SECONDARY
--      favourite (slot 'team_b')                         -> 3 pts + goals scored by that team
--   3. User predicted the winning team, and it was a FREE PICK (neither of
--      their favourites was playing in this fixture)      -> 6 pts + goals scored by that team
--   4. User predicted a team to win, but the match was a DRAW
--                                                          -> 1 pt + goals scored by their predicted team
--   5. User predicted DRAW, and the match WAS a draw       -> 2 pts + total goals in the match
--   6. Anything else (wrong winner predicted, etc.)        -> 0 pts
--
-- "favourite_tier" on the predictions row records primary/secondary/null
-- (free pick) at prediction time, so rules 1 vs 2 vs 3 are just a lookup.
-- =============================================================================

create or replace function public.score_fixture(_fixture_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
begin
  select * into f from public.fixtures where id = _fixture_id;

  if f is null then
    raise exception 'Fixture % not found', _fixture_id;
  end if;

  if f.status <> 'finished' or f.home_score is null or f.away_score is null then
    -- Not finished / no score yet: nothing to score. Clear any prior points
    -- in case a fixture's status was rolled back (admin correction).
    update public.predictions
    set points_awarded = null, goals_bonus = null
    where fixture_id = _fixture_id;
    return;
  end if;

  update public.predictions p
  set
    points_awarded = case
      -- Rule 5: predicted draw, match was a draw -> 2 pts + total match goals
      when f.home_score = f.away_score and p.predicted_outcome = 'draw'
        then 2 + (f.home_score + f.away_score)

      -- Rule 4: predicted a team, match was a draw -> 1 pt + goals by predicted team
      when f.home_score = f.away_score and p.predicted_outcome = 'home_win'
        then 1 + f.home_score
      when f.home_score = f.away_score and p.predicted_outcome = 'away_win'
        then 1 + f.away_score

      -- Home team won
      when f.home_score > f.away_score and p.predicted_outcome = 'home_win' then
        case p.favourite_tier
          when 'secondary' then 3 + f.home_score   -- Rule 2
          else 6 + f.home_score                    -- Rule 1 (primary) or Rule 3 (free pick)
        end

      -- Away team won
      when f.away_score > f.home_score and p.predicted_outcome = 'away_win' then
        case p.favourite_tier
          when 'secondary' then 3 + f.away_score   -- Rule 2
          else 6 + f.away_score                    -- Rule 1 (primary) or Rule 3 (free pick)
        end

      -- Rule 6: wrong prediction
      else 0
    end,
    goals_bonus = case
      when f.home_score = f.away_score and p.predicted_outcome = 'draw'
        then f.home_score + f.away_score
      when f.home_score = f.away_score and p.predicted_outcome = 'home_win'
        then f.home_score
      when f.home_score = f.away_score and p.predicted_outcome = 'away_win'
        then f.away_score
      when f.home_score > f.away_score and p.predicted_outcome = 'home_win'
        then f.home_score
      when f.away_score > f.home_score and p.predicted_outcome = 'away_win'
        then f.away_score
      else 0
    end
  where p.fixture_id = _fixture_id;

  update public.fixtures set scored_at = now() where id = _fixture_id;
end;
$$;

-- Re-score automatically whenever a fixture's score/status/penalty flag changes.
create or replace function public.trigger_score_fixture()
returns trigger
language plpgsql
as $$
begin
  perform public.score_fixture(new.id);
  return new;
end;
$$;

drop trigger if exists trg_score_fixture on public.fixtures;
create trigger trg_score_fixture
  after update of home_score, away_score, status, went_to_penalties on public.fixtures
  for each row
  execute function public.trigger_score_fixture();

-- Also score on insert, in case a fixture is created already-finished (e.g. backfill).
drop trigger if exists trg_score_fixture_insert on public.fixtures;
create trigger trg_score_fixture_insert
  after insert on public.fixtures
  for each row
  when (new.status = 'finished')
  execute function public.trigger_score_fixture();

-- -----------------------------------------------------------------------------
-- Determine + lock in favourite_tier whenever a prediction is created/updated,
-- BEFORE scoring runs. This keeps "which tier was this pick" computed in one
-- consistent place rather than duplicated in the frontend.
-- -----------------------------------------------------------------------------
create or replace function public.set_prediction_favourite_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fav record;
  fx record;
  predicted_team_id uuid;
begin
  select * into fav from public.user_favourite_teams where user_id = new.user_id;
  select * into fx from public.fixtures where id = new.fixture_id;

  if fav is null then
    new.favourite_tier := null;
    return new;
  end if;

  predicted_team_id := case new.predicted_outcome
    when 'home_win' then fx.home_team_id
    when 'away_win' then fx.away_team_id
    else null  -- draw predictions have no "team" tier
  end;

  if predicted_team_id is null then
    new.favourite_tier := null;
  elsif predicted_team_id = fav.team_a_id then
    new.favourite_tier := 'primary';
  elsif predicted_team_id = fav.team_b_id then
    new.favourite_tier := 'secondary';
  else
    new.favourite_tier := null; -- free pick
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_favourite_tier on public.predictions;
create trigger trg_set_favourite_tier
  before insert or update of predicted_outcome on public.predictions
  for each row
  execute function public.set_prediction_favourite_tier();
