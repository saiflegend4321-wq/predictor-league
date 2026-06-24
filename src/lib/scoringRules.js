// Mirrors the scoring logic in supabase/migrations/0002_scoring.sql.
// This file is for DISPLAY/EXPLANATION purposes only (rules page, prediction
// hints) — the database is the authoritative source of truth for actual
// point calculations.

export const SCORING_RULES = [
  {
    id: 1,
    label: "Favourite #1 wins",
    points: 6,
    description:
      "Your primary favourite team is playing and wins. You earn 6 points plus 1 point per goal they scored.",
  },
  {
    id: 2,
    label: "Favourite #2 wins",
    points: 3,
    description:
      "Your secondary favourite team is playing and wins. You earn 3 points plus 1 point per goal they scored.",
  },
  {
    id: 3,
    label: "Free pick wins",
    points: 6,
    description:
      "Neither favourite is playing, so you freely picked a team to win — and they did. You earn 6 points plus 1 point per goal they scored.",
  },
  {
    id: 4,
    label: "Match drawn (you picked a winner)",
    points: 1,
    description:
      "You predicted a team to win, but the match ended in a draw. You earn 1 point plus 1 point per goal your predicted team scored.",
  },
  {
    id: 5,
    label: "Draw predicted correctly",
    points: 2,
    description:
      "You predicted a draw, and the match was a draw. You earn 2 points plus 1 point per total goal scored in the match.",
  },
];

export const PENALTY_RULE =
  "If a match goes to a penalty shootout, the shootout goals are never counted — only the regulation/extra-time score is used for scoring.";

export const LOCK_RULE =
  "Predictions lock automatically at kickoff. If one of your two favourite teams is playing, your prediction is locked to backing them (or a draw) — you can't predict against your own team.";

export const FAVOURITE_RULE =
  "Pick two favourite teams before the tournament starts. Once locked, they apply for the whole tournament. When a favourite plays, you must back them (or predict a draw). When neither favourite is playing, you're free to predict any outcome.";
