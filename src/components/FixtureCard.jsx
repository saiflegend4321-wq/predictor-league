import { useState, useEffect, useMemo, useRef } from "react";
import { teamShortLabel } from "../lib/teamDisplay";
import ConfettiBurst from "./ConfettiBurst";

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
  const [showConfetti, setShowConfetti] = useState(false);
  const countdown               = useCountdown(fixture.kickoff_at);

  // Track score reveal animation — only animate the first time a score appears
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const prevHadScore = useRef(fixture.home_score != null);

  useEffect(() => {
    const hasScoreNow = fixture.home_score != null;
    if (hasScoreNow && !prevHadScore.current) {
      setScoreRevealed(true);
    }
    prevHadScore.current = hasScoreNow;
  }, [fixture.home_score]);

  // Fire confetti once when points_awarded transitions from null/0 to a positive value
  const prevPts = useRef(prediction?.points_awarded);
  useEffect(() => {
    const pts = prediction?.points_awarded;
    if (pts != null && pts > 0 && (prevPts.current == null || prevPts.current === 0)) {
      setShowConfetti(true);
    }
    prevPts.current = pts;
  }, [prediction?.points_awarded]);

  const kickoff  = new Date(fixture.kickoff_at);
  const isLocked = kickoff.getTime() <= Date.now() || fixture.status !== "scheduled";
  const isLive   = fixture.status === "live";
  const isDone   = fixture.status === "finished";

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
  const forcedFavOutcome = favHomeId ? "home_win" : favAwayId ? "away_win" : null;

  async function handlePick(outcome) {
    setLocalErr("");

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

  function btnDisabled(outcome) {
    if (isLocked || saving) return true;
    if (!forcedFavOutcome) return false;
    if (outcome === "draw") return false;
    return outcome !== forcedFavOutcome;
  }

  return (
    <div className={`card fixture-card ${isLive ? "live-glow" : ""}`}>
      {showConfetti && (
        <ConfettiBurst pieceCount={50} onDone={() => setShowConfetti(false)} />
      )}

      <div className="fixture-meta">
        <span className="muted" style={{ fontSize: "0.75rem" }}>{fixture.round}</span>
        <span className={`badge ${fixture.status}`}>{STATUS_LABEL[fixture.status]}</span>
      </div>

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
              <div className={`fixture-score ${scoreRevealed ? "reveal" : ""}`}>
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

      <div className="pick-row">
        {[
          { outcome: "home_win", label: `${teamShortLabel(fixture.home_team)} Win`, fav: favHomeId },
          { outcome: "draw",     label: "Draw",                                          fav: false     },
          { outcome: "away_win", label: `${teamShortLabel(fixture.away_team)} Win`, fav: favAwayId },
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

      {isLocked && !picked && !isDone && (
        <div className="muted center" style={{ fontSize: "0.75rem" }}>
          Predictions closed
        </div>
      )}

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
