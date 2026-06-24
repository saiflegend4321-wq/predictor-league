import { useState, useEffect, useMemo } from "react";

const STATUS_LABEL = {
  scheduled: "Upcoming",
  live:      "LIVE",
  finished:  "Full Time",
  postponed: "Postponed",
};

function useCountdown(kickoffAt) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    function tick() {
      const diff = new Date(kickoffAt).getTime() - Date.now();
      if (diff <= 0) { setDisplay(""); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (h > 0) setDisplay(`${h}h ${m}m`);
      else if (m > 0) setDisplay(`${m}m ${s}s`);
      else setDisplay(`${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [kickoffAt]);

  return display;
}

/**
 * Props
 *  fixture     — full fixture row with home_team / away_team joined
 *  favourites  — { team_a_id, team_b_id } | null
 *  prediction  — prediction row for this user+fixture | null
 *  onPredict   — async (fixtureId, outcome) => void
 */
export default function FixtureCard({ fixture, favourites, prediction, onPredict }) {
  const [saving, setSaving]     = useState(false);
  const [localErr, setLocalErr] = useState("");
  const countdown               = useCountdown(fixture.kickoff_at);

  const kickoff  = new Date(fixture.kickoff_at);
  const isLocked = kickoff.getTime() <= Date.now() || fixture.status !== "scheduled";
  const isLive   = fixture.status === "live";
  const isDone   = fixture.status === "finished";

  // Which (if any) of the user's favourites is playing in this match?
  const favHomeId = useMemo(() => {
    if (!favourites) return false;
    return (
      fixture.home_team.id === favourites.team_a_id ||
      fixture.home_team.id === favourites.team_b_id
    );
  }, [favourites, fixture.home_team.id]);

  const favAwayId = useMemo(() => {
    if (!favourites) return false;
    return (
      fixture.away_team.id === favourites.team_a_id ||
      fixture.away_team.id === favourites.team_b_id
    );
  }, [favourites, fixture.away_team.id]);

  const favTeamInMatch = favHomeId || favAwayId;

  // The outcome string the favourite forces (home_win or away_win)
  const forcedFavOutcome = favHomeId ? "home_win" : favAwayId ? "away_win" : null;

  async function handlePick(outcome) {
    setLocalErr("");

    // Client-side guard mirroring the DB rule
    if (forcedFavOutcome && outcome !== "draw" && outcome !== forcedFavOutcome) {
      setLocalErr("Your favourite is playing — back them or predict a draw.");
      return;
    }

    setSaving(true);
    try {
      await onPredict(fixture.id, outcome);
    } catch (err) {
      setLocalErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  const picked = prediction?.predicted_outcome;
  const pts    = prediction?.points_awarded;
  const bonus  = prediction?.goals_bonus ?? 0;

  // Determine if a pick button should be disabled
  function btnDisabled(outcome) {
    if (isLocked || saving) return true;
    if (!forcedFavOutcome) return false;          // free pick — all enabled
    if (outcome === "draw") return false;          // draw always allowed
    return outcome !== forcedFavOutcome;           // block picking against own fav
  }

  return (
    <div className={`card fixture-card ${isLive ? "live-glow" : ""}`}>

      {/* Status badge + round label */}
      <div className="fixture-meta">
        <span className="muted" style={{ fontSize: "0.75rem" }}>{fixture.round}</span>
        <span className={`badge ${fixture.status}`}>{STATUS_LABEL[fixture.status]}</span>
      </div>

      {/* Teams + score */}
      <div className="fixture-teams">
        <div className="fixture-team">
          <span className="flag">{fixture.home_team.flag_emoji}</span>
          <span className="name">{fixture.home_team.name}</span>
          {favHomeId && (
            <span style={{ fontSize: "0.65rem", color: "var(--gold)" }}>
              ★ Fav {fixture.home_team.id === favourites?.team_a_id ? "#1" : "#2"}
            </span>
          )}
        </div>

        <div style={{ textAlign: "center", minWidth: 60 }}>
          {(isLive || isDone) && fixture.home_score != null ? (
            <>
              <div className="fixture-score">
                {fixture.home_score} – {fixture.away_score}
              </div>
              {fixture.went_to_penalties && (
                <div className="muted" style={{ fontSize: "0.62rem" }}>
                  (after pens — not counted)
                </div>
              )}
            </>
          ) : (
            <span className="fixture-vs">VS</span>
          )}
        </div>

        <div className="fixture-team">
          <span className="flag">{fixture.away_team.flag_emoji}</span>
          <span className="name">{fixture.away_team.name}</span>
          {favAwayId && (
            <span style={{ fontSize: "0.65rem", color: "var(--gold)" }}>
              ★ Fav {fixture.away_team.id === favourites?.team_a_id ? "#1" : "#2"}
            </span>
          )}
        </div>
      </div>

      {/* Kickoff time / countdown */}
      <div className="muted" style={{ fontSize: "0.75rem", textAlign: "center" }}>
        {isLive ? (
          <span style={{ color: "var(--red)", fontWeight: 700 }}>● Match in progress</span>
        ) : isDone ? (
          kickoff.toLocaleDateString(undefined, { day: "numeric", month: "short" })
        ) : countdown ? (
          <>
            {kickoff.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            <span style={{ marginLeft: 6, color: "var(--gold)", fontWeight: 600 }}>
              ({countdown})
            </span>
          </>
        ) : (
          kickoff.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
        )}
        {fixture.venue ? ` · ${fixture.venue}` : ""}
      </div>

      {/* Favourite-lock hint */}
      {favTeamInMatch && !isLocked && (
        <div style={{
          fontSize: "0.72rem", color: "var(--gold)", textAlign: "center",
          padding: "4px 8px", background: "rgba(232,185,74,0.08)",
          borderRadius: 6, margin: "0 0 4px",
        }}>
          ⭐ Back your favourite or pick a draw
        </div>
      )}

      {localErr && (
        <div className="error-banner" style={{ margin: "4px 0", fontSize: "0.8rem" }}>
          {localErr}
        </div>
      )}

      {/* Pick buttons */}
      <div className="pick-row">
        {[
          { outcome: "home_win", label: `${fixture.home_team.fifa_code} Win`, fav: favHomeId },
          { outcome: "draw",     label: "Draw",                               fav: false     },
          { outcome: "away_win", label: `${fixture.away_team.fifa_code} Win`, fav: favAwayId },
        ].map(({ outcome, label, fav }) => (
          <button
            key={outcome}
            className={[
              "pick-btn",
              picked === outcome ? "selected" : "",
              fav ? "locked-fav" : "",
            ].join(" ")}
            disabled={btnDisabled(outcome)}
            onClick={() => handlePick(outcome)}
          >
            {label}
            {fav && <span style={{ display: "block", fontSize: "0.6rem", opacity: 0.8 }}>★ fav</span>}
          </button>
        ))}
      </div>

      {/* After kickoff lock notice */}
      {isLocked && !picked && !isDone && (
        <div className="muted center" style={{ fontSize: "0.75rem" }}>
          Predictions closed
        </div>
      )}

      {/* Points result */}
      {pts != null && (
        <div className="center" style={{ marginTop: 4 }}>
          <span className={`points-pill ${pts > 0 ? "positive" : "zero"}`}>
            {pts > 0 ? `+${pts} pts` : "0 pts"}
            {bonus > 0 ? ` (${bonus} goal bonus)` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
