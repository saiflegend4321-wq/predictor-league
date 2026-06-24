import { useState, useEffect, useMemo } from "react";

const STATUS_LABEL = {
  scheduled: "Upcoming",
  live:      "LIVE",
  finished:  "Full Time",
  postponed: "Postponed",
};

// ... (keep your useCountdown hook exactly as it is) ...
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

export default function FixtureCard({ fixture, favourites, prediction, onPredict }) {
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState("");
  const countdown = useCountdown(fixture.kickoff_at);

  const kickoff = new Date(fixture.kickoff_at);
  const isLocked = kickoff.getTime() <= Date.now() || fixture.status !== "scheduled";
  const isLive = fixture.status === "live";
  const isDone = fixture.status === "finished";

  // Logic for Favs
  const favHomeId = useMemo(() => favourites && (fixture.home_team.id === favourites.team_a_id || fixture.home_team.id === favourites.team_b_id), [favourites, fixture.home_team.id]);
  const favAwayId = useMemo(() => favourites && (fixture.away_team.id === favourites.team_a_id || fixture.away_team.id === favourites.team_b_id), [favourites, fixture.away_team.id]);
  const forcedFavOutcome = favHomeId ? "home_win" : favAwayId ? "away_win" : null;

  async function handlePick(outcome) {
    setLocalErr("");
    if (forcedFavOutcome && outcome !== "draw" && outcome !== forcedFavOutcome) {
      setLocalErr("Your favourite is playing — back them or pick a draw.");
      return;
    }
    setSaving(true);
    try {
      // FIX: Ensure we are passing the correct arguments expected by your Fixtures.jsx
      await onPredict(fixture.id, null, null, outcome);
    } catch (err) {
      setLocalErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  const picked = prediction?.predicted_outcome;
  const pts = prediction?.points_awarded;

  return (
    <div className={`card fixture-card ${isLive ? "live-glow" : ""}`}>
      <div className="fixture-meta">
        <span className="muted" style={{ fontSize: "0.75rem" }}>{fixture.round}</span>
        <span className={`badge ${fixture.status}`}>{STATUS_LABEL[fixture.status]}</span>
      </div>
      
      {/* ... (Keep your existing Team/Score UI blocks here) ... */}

      <div className="pick-row">
        {[
          { outcome: "home_win", label: `${fixture.home_team.fifa_code} Win`, fav: favHomeId },
          { outcome: "draw",     label: "Draw",                               fav: false     },
          { outcome: "away_win", label: `${fixture.away_team.fifa_code} Win`, fav: favAwayId },
        ].map(({ outcome, label, fav }) => (
          <button
            key={outcome}
            className={["pick-btn", picked === outcome ? "selected" : "", fav ? "locked-fav" : ""].join(" ")}
            disabled={isLocked || saving}
            onClick={() => handlePick(outcome)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}