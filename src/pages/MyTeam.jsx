import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function MyTeam() {
  const { user, profile } = useAuth();
  const [teams,      setTeams]      = useState([]);
  const [favourites, setFavourites] = useState(null);
  const [teamA,      setTeamA]      = useState(null);
  const [teamB,      setTeamB]      = useState(null);
  const [predStats,  setPredStats]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");
  const [filter,     setFilter]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: teamRows, error: te }, { data: favRow }, { data: preds }] =
        await Promise.all([
          supabase.from("teams").select("id,name,fifa_code,flag_emoji").order("name"),
          supabase.from("user_favourite_teams").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("predictions").select("points_awarded,goals_bonus,predicted_outcome").eq("user_id", user.id),
        ]);
      if (te) throw te;
      setTeams(teamRows ?? []);
      setFavourites(favRow ?? null);
      setTeamA(favRow?.team_a_id ?? null);
      setTeamB(favRow?.team_b_id ?? null);

      // Aggregate prediction stats
      const scored  = (preds ?? []).filter((p) => p.points_awarded != null);
      const correct = scored.filter((p) => p.points_awarded > 0);
      const totalPts = scored.reduce((s, p) => s + (p.points_awarded ?? 0), 0);
      const totalBonus = scored.reduce((s, p) => s + (p.goals_bonus ?? 0), 0);
      setPredStats({
        total:   (preds ?? []).length,
        scored:  scored.length,
        correct: correct.length,
        pts:     totalPts,
        bonus:   totalBonus,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const isLocked = favourites?.locked === true;

  function pickTeam(teamId) {
    if (isLocked) return;
    setError(""); setSuccess("");
    if (teamA === teamId) { setTeamA(null); return; }
    if (teamB === teamId) { setTeamB(null); return; }
    if (!teamA) { setTeamA(teamId); return; }
    if (!teamB) { setTeamB(teamId); return; }
    setError("You already have 2 favourites selected. Deselect one first.");
  }

  async function handleSave(lockNow) {
    setError(""); setSuccess("");
    if (!teamA || !teamB) { setError("Please select exactly 2 favourite teams."); return; }
    setSaving(true);
    try {
      const { error: ue } = await supabase
        .from("user_favourite_teams")
        .upsert({ user_id: user.id, team_a_id: teamA, team_b_id: teamB, locked: lockNow },
                { onConflict: "user_id" });
      if (ue) throw ue;
      setSuccess(lockNow
        ? "🔒 Locked in! Your favourites are set for the tournament."
        : "Saved. You can still change until you lock them in.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page center muted">Loading…</div>;

  const teamAObj = teams.find((t) => t.id === teamA);
  const teamBObj = teams.find((t) => t.id === teamB);
  const filtered = teams.filter((t) =>
    !filter || t.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>My Team</h1>
        <p>
          Pick <strong>2 favourite teams</strong> for the World Cup.
          Favourite #1 earns <strong>6 pts</strong> per win + goals,
          Favourite #2 earns <strong>3 pts</strong> per win + goals.
        </p>
      </div>

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {/* ── Stats summary ──────────────────────────────────────────── */}
      {predStats && predStats.total > 0 && (
        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          {[
            { label: "Total Predictions", value: predStats.total },
            { label: "Scored",            value: predStats.scored },
            { label: "Correct",           value: predStats.correct, color: "var(--green)" },
            { label: "Total Points",      value: predStats.pts,     color: "var(--gold)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card stat-card">
              <div className="label">{label}</div>
              <div className="value" style={color ? { color } : {}}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Current selection banner ───────────────────────────────── */}
      {(teamA || teamB) && (
        <div className="card" style={{ marginBottom: 20, padding: "14px 18px" }}>
          <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Favourite #1 · 6 pts/win
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--gold)", marginTop: 2 }}>
                {teamAObj ? `${teamAObj.flag_emoji} ${teamAObj.name}` : "Not selected"}
              </div>
            </div>
            <div style={{ color: "var(--border)", fontSize: "1.5rem" }}>·</div>
            <div>
              <div className="muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Favourite #2 · 3 pts/win
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--blue)", marginTop: 2 }}>
                {teamBObj ? `${teamBObj.flag_emoji} ${teamBObj.name}` : "Not selected"}
              </div>
            </div>
            {isLocked && (
              <span style={{
                marginLeft: "auto", background: "rgba(47,174,107,0.15)", color: "var(--green)",
                padding: "4px 12px", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 700,
              }}>
                🔒 LOCKED
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Team picker grid ───────────────────────────────────────── */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>
            {isLocked ? "Your Locked Favourites" : "Choose Your Two Favourites"}
          </h3>
          {!isLocked && (
            <input
              placeholder="Search team…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 180 }}
            />
          )}
        </div>

        {isLocked ? (
          <p className="muted" style={{ fontSize: "0.87rem" }}>
            Your picks are locked in for the tournament. Contact the admin if you need to make a correction.
          </p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: "0.83rem", marginBottom: 12 }}>
              Click once to set <span style={{ color: "var(--gold)" }}>Favourite #1</span>,
              click a second team for <span style={{ color: "var(--blue)" }}>Favourite #2</span>.
              Click a selected team again to deselect it.
            </p>

            <div className="team-picker">
              {filtered.map((t) => {
                const isA = teamA === t.id;
                const isB = teamB === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={[
                      "team-chip",
                      isA ? "selected-a" : "",
                      isB ? "selected-b" : "",
                    ].join(" ")}
                    onClick={() => pickTeam(t.id)}
                  >
                    <span className="flag">{t.flag_emoji}</span>
                    <span className="name">{t.name}</span>
                    {isA && <span style={{ fontSize: "0.6rem", color: "var(--gold)", fontWeight: 700 }}>FAV #1</span>}
                    {isB && <span style={{ fontSize: "0.6rem", color: "var(--blue)", fontWeight: 700 }}>FAV #2</span>}
                  </button>
                );
              })}
            </div>

            <div className="flex-between" style={{ marginTop: 20 }}>
              <button className="btn secondary" onClick={() => handleSave(false)} disabled={saving || !teamA || !teamB}>
                Save (keep editable)
              </button>
              <button className="btn" onClick={() => handleSave(true)} disabled={saving || !teamA || !teamB}>
                {saving ? "Saving…" : "🔒 Lock In For The Tournament"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
