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
 * fixture     — full fixture row with home_team / away_team joined
 * favourites  — { team_a_id, team_b_id } | null
 * prediction  — prediction row for this user+fixture | null
 * onPredict   — async (fixtureId, homeScore, awayScore, outcome) => void
 */
export default function FixtureCard({ fixture, favourites, prediction, onPredict }) {
  const [saving, setSaving]     = useState(false);
  const [localErr, setLocalErr] = useState("");
  const countdown               = useCountdown(fixture.kickoff_at);

  // Local state variables for score input values
  const [homeInput, setHomeInput] = useState("");
  const [awayInput, setAwayInput] = useState("");

  // Keep local inputs synchronized when prediction values load from database asynchronously
  useEffect(() => {
    if (prediction) {
      setHomeInput(prediction.predicted_home_score ?? "");
      setAwayInput(prediction.predicted_away_score ?? "");
    } else {
      setHomeInput("");
      setAwayInput("");
    }
  }, [prediction]);

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

  async function handleSavePrediction() {
    setLocalErr("");

    // Validate inputs aren't blank strings
    if (homeInput === "" || awayInput === "") {
      setLocalErr("Please enter goals for both teams.");
      return;
    }

    const hScore = parseInt(homeInput, 10);
    const aScore = parseInt(awayInput, 10);

    // Validate input numeric formats
    if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
      setLocalErr("Scores must be valid positive whole numbers.");
      return;
    }

    // Automatically derive the text outcome identifier for business logic consistency
    let outcome = "draw";
    if (hScore > aScore) outcome = "home_win";
    if (aScore > hScore) outcome = "away_win";

    // Client-side guard checking favorite team rules
    if (forcedFavOutcome && outcome !== "draw" && outcome !== forcedFavOutcome) {
      setLocalErr("Your favourite is playing — back them or predict a draw.");
      return;
    }

    setSaving(true);
    try {
      // Sends the numeric values and structural outcome up to the main view file to submit to Supabase
      await onPredict(fixture.id, hScore, aScore, outcome);
    } catch (err) {
      setLocalErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  const pts   = prediction?.points_awarded;
  const bonus = prediction?.goals_bonus ?? 0;

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
      <div className="muted" style={{ fontSize: "0.75rem", textAlign: "center", marginBottom: "8px" }}>
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
          borderRadius: 6, margin: "0 0 8px",
        }}>
          ⭐ Back your favourite or pick a draw
        </div>
      )}

      {localErr && (
        <div className="error-banner" style={{ margin: "4px 0", fontSize: "0.8rem" }}>
          {localErr}
        </div>
      )}

      {/* SCORE PREDICTION FIELDS INPUT WORKFLOW */}
      {!isLocked ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "14px" }}>
            
            {/* Home Score Input */}
            <div style={{ textAlign: "center" }}>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={homeInput}
                disabled={saving}
                onChange={(e) => setHomeInput(e.target.value)}
                style={{
                  width: "60px",
                  padding: "8px",
                  fontSize: "1.25rem",
                  fontWeight: "bold",
                  textAlign: "center",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text)"
                }}
              />
            </div>

            <span style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--text-dim)" }}>–</span>

            {/* Away Score Input */}
            <div style={{ textAlign: "center" }}>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={awayInput}
                disabled={saving}
                onChange={(e) => setAwayInput(e.target.value)}
                style={{
                  width: "60px",
                  padding: "8px",
                  fontSize: "1.25rem",
                  fontWeight: "bold",
                  textAlign: "center",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text)"
                }}
              />
            </div>

          </div>

          <button
            className="btn small"
            disabled={saving}
            onClick={handleSavePrediction}
            style={{ width: "100%", cursor: "pointer" }}
          >
            {saving ? "Saving..." : "Lock Prediction"}
          </button>
        </div>
      ) : (
        /* If match is locked and user has a recorded prediction, display what they predicted */
        prediction && (
          <div className="center" style={{ 
            fontSize: "0.88rem", 
            marginTop: "10px", 
            padding: "8px", 
            background: "rgba(255,255,255,0.03)", 
            borderRadius: "6px",
            border: "1px dashed var(--border)"
          }}>
            <span className="muted">Your Prediction:</span>{" "}
            <strong style={{ color: "var(--gold)", fontSize: "1rem", marginLeft: "4px" }}>
              {prediction.predicted_home_score} – {prediction.predicted_away_score}
            </strong>
          </div>
        )
      )}

      {/* After kickoff lock notice if user missed predicting */}
      {isLocked && !prediction && !isDone && (
        <div className="muted center" style={{ fontSize: "0.75rem", marginTop: "10px" }}>
          Predictions closed
        </div>
      )}

      {/* Points result display */}
      {pts != null && (
        <div className="center" style={{ marginTop: 8 }}>
          <span className={`points-pill ${pts > 0 ? "positive" : "zero"}`}>
            {pts > 0 ? `+${pts} pts` : "0 pts"}
            {bonus > 0 ? ` (${bonus} goal bonus)` : ""}
          </span>
        </div>
      )}
    </div>
  );
}