-- =============================================================================
-- FIFA Fantasy Predictor — Leaderboard View
-- =============================================================================
-- Ranks users by total points across all SCORED predictions. Tiebreak: the
-- user with more correct ("scoring", i.e. points_awarded > 0) predictions
-- ranks higher. Further ties share the same rank (standard competition rank).
-- =============================================================================

create or replace view public.leaderboard as
with totals as (
  select
    pr.user_id,
    coalesce(sum(pr.points_awarded), 0)::int as total_points,
    count(*) filter (where pr.points_awarded > 0)::int as correct_predictions,
    count(*) filter (where pr.points_awarded is not null)::int as scored_predictions,
    count(*)::int as total_predictions
  from public.predictions pr
  group by pr.user_id
)
select
  p.id as user_id,
  coalesce(p.display_name, split_part(p.email, '@', 1)) as display_name,
  p.avatar_url,
  ft.team_a_id,
  ta.name as team_a_name,
  ft.team_b_id,
  tb.name as team_b_name,
  coalesce(t.total_points, 0) as total_points,
  coalesce(t.correct_predictions, 0) as correct_predictions,
  coalesce(t.scored_predictions, 0) as scored_predictions,
  coalesce(t.total_predictions, 0) as total_predictions,
  rank() over (
    order by coalesce(t.total_points, 0) desc, coalesce(t.correct_predictions, 0) desc
  ) as rank
from public.profiles p
left join totals t on t.user_id = p.id
left join public.user_favourite_teams ft on ft.user_id = p.id
left join public.teams ta on ta.id = ft.team_a_id
left join public.teams tb on tb.id = ft.team_b_id
order by rank asc;

-- Views inherit RLS from their underlying tables' policies when queried via
-- PostgREST under the invoking user's role, but to be explicit and ensure the
-- leaderboard is publicly readable regardless of predictions/profiles policy
-- nuances, expose it through a security-definer function instead.
create or replace function public.get_leaderboard()
returns setof public.leaderboard
language sql
stable
security definer
set search_path = public
as $$
  select * from public.leaderboard;
$$;
