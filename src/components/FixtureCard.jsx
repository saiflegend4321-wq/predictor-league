import { useState, useEffect, useMemo } from "react";

// ─── Status labels ────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  scheduled: "Upcoming",
  live:      "LIVE",
  finished:  "Full Time",
  postponed: "Postponed",
};

// ─── Countdown hook ───────────────────────────────────────────────────────────
function useCountdown(kickoffAt) {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    function tick() {
      const diff = new Date(kickoffAt).getTime() - Date.now();
      if (diff <= 0) { setDisplay(""); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (h > 0)      setDisplay(`${h}h ${m}m`);
      else if (m > 0) setDisplay(`${m}m ${s}s`);
      else            setDisplay(`${s}s`);
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [kickoffAt]);
  return display;
}

// ─── Safe team helpers ────────────────────────────────────────────────────────
// Knockout fixtures can have home_team / away_team = null when the qualifier
// hasn't been determined yet (e.g. "Winner Group A"). These helpers make every
// access null-safe so the card never crashes and shows "TBD" gracefully.
function teamName(team, placeholder = "TBD")  { return team?.name      || placeholder; }
function teamCode(team, placeholder = "TBD")  { return team?.fifa_code || placeholder; }
function teamFlag(team, placeholder = "🏳️")   { return team?.flag_emoji || placeholder; }
function teamId(team)                          { return team?.id ?? null; }

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * Props:
 *   fixture     — DB row with home_team / away_team joined (may be null for KO rounds)
 *   favourites  — { team_a_id, team_b_id } | null
 *   prediction  — prediction row for this user+fixture | null
 *   onPredict   — async (fixtureId, outcome, homeGoals?, awayGoals?) => void
 */
export default function FixtureCard({ fixture, favourites, prediction, onPredict }) {
  const [saving,   setSaving]   = useState(false);
  const [localErr, setLocalErr] = useState("");
  const countdown               = useCountdown(fixture.kickoff_at);

  // ── Score prediction state (the missing inputs from before) ──
  const [predHome, setPredHome] = useState(
    prediction?.predicted_home_score ?? ""
  );
  const [predAway, setPredAway] = useState(
    prediction?.predicted_away_score ?? ""
  );
  const [scoreMode, setScoreMode] = useState(false); // toggle score input panel

  const kickoff  = new Date(fixture.kickoff_at);
  const isLocked = kickoff.getTime() <= Date.now() || fixture.status !== "scheduled";
  const isLive   = fixture.status === "live";
  const isDone   = fixture.status === "finished";

  // Both teams must be known before any interaction is allowed
  const homeTeam    = fixture.home_team;
  const awayTeam    = fixture.away_team;
  const teamsKnown  = Boolean(homeTeam?.id && awayTeam?.id);

  // ── Favourite detection — fully null-safe ──
  const favHomeId = useMemo(() => {
    if (!favourites || !homeTeam?.id) return false;
    return (
      homeTeam.id === favourites.team_a_id ||
      homeTeam.id === favourites.team_b_id
    );
  }, [favourites, homeTeam?.id]);

  const favAwayId = useMemo(() => {
    if (!favourites || !awayTeam?.id) return false;
    return (
      awayTeam.id === favourites.team_a_id ||
      awayTeam.id === favourites.team_b_id
    );
  }, [favourites, awayTeam?.id]);

  const favTeamInMatch    = favHomeId || favAwayId;
  const forcedFavOutcome  = favHomeId ? "home_win" : favAwayId ? "away_win" : null;

  // ── Outcome pick ──────────────────────────────────────────────────────────
  async function handlePick(outcome) {
    setLocalErr("");
    if (!teamsKnown) {
      setLocalErr("Teams for this fixture haven't been confirmed yet.");
      return;
    }
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

  // ── Score prediction submit ───────────────────────────────────────────────
  async function handleScoreSubmit(e) {
    e.preventDefault();
    setLocalErr("");
    const h = parseInt(predHome, 10);
    const a = parseInt(predAway, 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      setLocalErr("Enter valid scores (0 or more) for both teams.");
      return;
    }
    if (!teamsKnown) {
      setLocalErr("Teams for this fixture haven't been confirmed yet.");
      return;
    }

    // Derive outcome from predicted score
    const outcome = h > a ? "home_win" : h < a ? "away_win" : "draw";

    if (forcedFavOutcome && outcome !== "draw" && outcome !== forcedFavOutcome) {
      setLocalErr(
        `You must back ${teamName(favHomeId ? homeTeam : awayTeam)} or predict a draw.`
      );
      return;
    }

    setSaving(true);
    try {
      await onPredict(fixture.id, outcome, h, a);
      setScoreMode(false);
    } catch (err) {
      setLocalErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  const picked = prediction?.predicted_outcome;
  const pts    = prediction?.points_awarded;
  const bonus  = prediction?.goals_bonus ?? 0;
  const predHS = prediction?.predicted_home_score;
  const predAS = prediction?.predicted_away_score;

  function btnDisabled(outcome) {
    if (isLocked || saving || !teamsKnown) return true;
    if (!forcedFavOutcome) return false;
    if (outcome === "draw")  return false;
    return outcome !== forcedFavOutcome;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`card fixture-card ${isLive ? "live-glow" : ""} ${!teamsKnown ? "fixture-tbd" : ""}`}
      style={!teamsKnown ? { opacity: 0.72 } : {}}
    >
      {/* ── Status badge + round ── */}
      <div className="fixture-meta">
        <span className="muted" style={{ fontSize: "0.75rem" }}>
          {fixture.group_label ? `${fixture.group_label} · ` : ""}
          {fixture.round}
        </span>
        <span className={`badge ${fixture.status}`}>
          {STATUS_LABEL[fixture.status] ?? fixture.status}
        </span>
      </div>

      {/* ── TBD notice ── */}
      {!teamsKnown && (
        <div style={{
          textAlign: "center", fontSize: "0.72rem", color: "var(--gold)",
          background: "rgba(232,185,74,0.08)", borderRadius: 6,
          padding: "4px 8px", marginBottom: 6,
        }}>
          ⏳ Qualified teams not yet determined
        </div>
      )}

      {/* ── Teams + score ── */}
      <div className="fixture-teams">
        {/* Home */}
        <div className="fixture-team">
          <span className="flag">{teamFlag(homeTeam)}</span>
          <span className={`name ${!homeTeam?.id ? "muted" : ""}`}>
            {teamName(homeTeam)}
          </span>
          {homeTeam?.fifa_code && (
            <span className="muted" style={{ fontSize: "0.68rem" }}>
              {homeTeam.fifa_code}
            </span>
          )}
          {favHomeId && (
            <span style={{ fontSize: "0.65rem", color: "var(--gold)" }}>
              ★ Fav {homeTeam.id === favourites?.team_a_id ? "#1" : "#2"}
            </span>
          )}
        </div>

        {/* Score / VS */}
        <div style={{ textAlign: "center", minWidth: 64 }}>
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

        {/* Away */}
        <div className="fixture-team">
          <span className="flag">{teamFlag(awayTeam)}</span>
          <span className={`name ${!awayTeam?.id ? "muted" : ""}`}>
            {teamName(awayTeam)}
          </span>
          {awayTeam?.fifa_code && (
            <span className="muted" style={{ fontSize: "0.68rem" }}>
              {awayTeam.fifa_code}
            </span>
          )}
          {favAwayId && (
            <span style={{ fontSize: "0.65rem", color: "var(--gold)" }}>
              ★ Fav {awayTeam.id === favourites?.team_a_id ? "#1" : "#2"}
            </span>
          )}
        </div>
      </div>

      {/* ── Kickoff / countdown ── */}
      <div className="muted" style={{ fontSize: "0.75rem", textAlign: "center" }}>
        {isLive ? (
          <span style={{ color: "var(--red)", fontWeight: 700 }}>● Match in progress</span>
        ) : isDone ? (
          kickoff.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
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

      {/* ── Favourite hint ── */}
      {favTeamInMatch && !isLocked && (
        <div style={{
          fontSize: "0.72rem", color: "var(--gold)", textAlign: "center",
          padding: "4px 8px", background: "rgba(232,185,74,0.08)",
          borderRadius: 6, margin: "4px 0",
        }}>
          ⭐ Back your favourite or pick a draw
        </div>
      )}

      {/* ── Error ── */}
      {localErr && (
        <div className="error-banner" style={{ margin: "4px 0", fontSize: "0.8rem" }}>
          {localErr}
        </div>
      )}

      {/* ── Prediction inputs (hidden when TBD or locked) ── */}
      {!isLocked && teamsKnown && (
        <>
          {/* Toggle between outcome buttons and score input */}
          {!scoreMode ? (
            <>
              {/* ── Outcome pick buttons ── */}
              <div className="pick-row">
                {[
                  { outcome: "home_win", label: `${teamCode(homeTeam)} Win`, fav: favHomeId },
                  { outcome: "draw",     label: "Draw",                       fav: false     },
                  { outcome: "away_win", label: `${teamCode(awayTeam)} Win`, fav: favAwayId },
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
                    {fav && (
                      <span style={{ display: "block", fontSize: "0.6rem", opacity: 0.8 }}>
                        ★ fav
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Switch to score prediction mode */}
              <button
                onClick={() => { setScoreMode(true); setLocalErr(""); }}
                style={{
                  display: "block", width: "100%", marginTop: 6,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px dashed rgba(255,255,255,0.15)",
                  color: "var(--text-dim)", borderRadius: 6,
                  padding: "5px 0", fontSize: "0.75rem", cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              >
                🎯 Predict exact score instead
              </button>
            </>
          ) : (
            /* ── Score prediction form ── */
            <form onSubmit={handleScoreSubmit} style={{ marginTop: 6 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
                marginBottom: 8,
              }}>
                {/* Home score */}
                <div style={{ textAlign: "center" }}>
                  <div className="muted" style={{ fontSize: "0.68rem", marginBottom: 3 }}>
                    {teamCode(homeTeam)}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={predHome}
                    onChange={(e) => setPredHome(e.target.value)}
                    required
                    style={{
                      width: 56, height: 44, textAlign: "center",
                      fontSize: "1.3rem", fontWeight: 700,
                      background: "var(--card-bg, #1a2035)",
                      border: "2px solid rgba(255,255,255,0.2)",
                      borderRadius: 8, color: "var(--text)",
                      outline: "none",
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = "var(--gold)"}
                    onBlur={(e)  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"}
                  />
                </div>

                <span style={{
                  fontSize: "1.4rem", fontWeight: 700,
                  color: "var(--text-dim)", lineHeight: 1,
                  marginTop: 16,
                }}>–</span>

                {/* Away score */}
                <div style={{ textAlign: "center" }}>
                  <div className="muted" style={{ fontSize: "0.68rem", marginBottom: 3 }}>
                    {teamCode(awayTeam)}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={predAway}
                    onChange={(e) => setPredAway(e.target.value)}
                    required
                    style={{
                      width: 56, height: 44, textAlign: "center",
                      fontSize: "1.3rem", fontWeight: 700,
                      background: "var(--card-bg, #1a2035)",
                      border: "2px solid rgba(255,255,255,0.2)",
                      borderRadius: 8, color: "var(--text)",
                      outline: "none",
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = "var(--gold)"}
                    onBlur={(e)  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"}
                  />
                </div>
              </div>

              {/* Outcome preview */}
              {predHome !== "" && predAway !== "" && (
                <div style={{
                  textAlign: "center", fontSize: "0.73rem",
                  color: "var(--gold)", marginBottom: 6,
                }}>
                  {parseInt(predHome) > parseInt(predAway)
                    ? `→ ${teamName(homeTeam)} Win`
                    : parseInt(predHome) < parseInt(predAway)
                    ? `→ ${teamName(awayTeam)} Win`
                    : "→ Draw"}
                </div>
              )}

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn small"
                  style={{ flex: 1 }}
                >
                  {saving ? "Saving…" : "Save Prediction"}
                </button>
                <button
                  type="button"
                  onClick={() => { setScoreMode(false); setLocalErr(""); }}
                  className="btn small secondary"
                  style={{ flex: 1 }}
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {/* ── Lock notice (after kickoff, no prediction made) ── */}
      {isLocked && !picked && !isDone && teamsKnown && (
        <div className="muted center" style={{ fontSize: "0.75rem", marginTop: 8 }}>
          Predictions closed
        </div>
      )}

      {/* ── TBD — predictions not yet available ── */}
      {!teamsKnown && (
        <div className="muted center" style={{ fontSize: "0.75rem", marginTop: 8 }}>
          Predictions open once teams are confirmed
        </div>
      )}

      {/* ── Prediction already made — show what they predicted ── */}
      {picked && !scoreMode && (
        <div style={{
          marginTop: 6, textAlign: "center", fontSize: "0.8rem",
          color: "var(--text-dim)",
        }}>
          Your pick:{" "}
          <strong style={{ color: "var(--text)" }}>
            {picked === "home_win"
              ? `${teamName(homeTeam)} Win`
              : picked === "away_win"
              ? `${teamName(awayTeam)} Win`
              : "Draw"}
          </strong>
          {predHS != null && predAS != null && (
            <span className="muted" style={{ marginLeft: 6 }}>
              ({predHS}–{predAS})
            </span>
          )}
        </div>
      )}

      {/* ── Points result ── */}
      {pts != null && (
        <div className="center" style={{ marginTop: 6 }}>
          <span className={`points-pill ${pts > 0 ? "positive" : "zero"}`}>
            {pts > 0 ? `+${pts} pts` : "0 pts"}
            {bonus > 0 && ` (incl. ${bonus} goal bonus)`}
          </span>
        </div>
      )}
    </div>
  );
}