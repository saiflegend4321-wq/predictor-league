-- =============================================================================
-- FIFA Fantasy Predictor — Prediction Validation Rules
-- =============================================================================
-- Enforces, at the database level (so it can't be bypassed by a buggy client):
--   1. Predictions are locked once the fixture has kicked off.
--   2. If one (or both) of the user's favourite teams is playing in a fixture,
--      their prediction must back that team to win (or predict a draw) —
--      they cannot predict the OTHER team to win instead.
--      (If both favourites are playing each other, either is allowed.)
-- =============================================================================

create or replace function public.validate_prediction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fx record;
  fav record;
  predicted_team_id uuid;
  fav_in_match uuid; -- which favourite (if any) is playing in this fixture
begin
  select * into fx from public.fixtures where id = new.fixture_id;
  if fx is null then
    raise exception 'Fixture not found';
  end if;

  -- Rule: locked at kickoff
  if fx.kickoff_at <= now() then
    raise exception 'Predictions are locked for this fixture — kickoff has passed';
  end if;

  -- Rule: must back your favourite if it's playing
  select * into fav from public.user_favourite_teams where user_id = new.user_id;

  if fav is not null then
    predicted_team_id := case new.predicted_outcome
      when 'home_win' then fx.home_team_id
      when 'away_win' then fx.away_team_id
      else null
    end;

    if fx.home_team_id = fav.team_a_id or fx.home_team_id = fav.team_b_id then
      fav_in_match := fx.home_team_id;
    elsif fx.away_team_id = fav.team_a_id or fx.away_team_id = fav.team_b_id then
      fav_in_match := fx.away_team_id;
    end if;

    -- If a favourite is in this match, the user may only predict that team to
    -- win, or a draw. They may NOT predict the opposing team to win instead.
    if fav_in_match is not null
       and new.predicted_outcome <> 'draw'
       and predicted_team_id <> fav_in_match then
      raise exception 'One of your favourite teams is playing — you must predict them to win or predict a draw';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_prediction on public.predictions;
create trigger trg_validate_prediction
  before insert or update of predicted_outcome on public.predictions
  for each row
  execute function public.validate_prediction();
