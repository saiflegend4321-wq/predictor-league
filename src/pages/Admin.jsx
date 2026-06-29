import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { teamShortLabel } from "../lib/teamDisplay";

const STATUS_OPTIONS = ["scheduled", "live", "finished", "postponed"];
const OUTCOME_LABELS = { home_win: "Home Win", away_win: "Away Win", draw: "Draw" };
const TABS = ["fixtures", "users", "leagues"];

export default function Admin() {
  const [activeTab, setActiveTab] = useState("fixtures");

  return (
    <div className="page">
      <div className="page-header">
        <h1>Admin Panel</h1>
        <p>Full administrative control over fixtures, users, leagues and predictions.</p>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {TABS.map((t) => (
          <button key={t} className={activeTab === t ? "active" : ""} onClick={() => setActiveTab(t)}>
            {t === "fixtures" ? "⚽ Fixtures" : t === "users" ? "👥 Users" : "🏆 Leagues"}
          </button>
        ))}
      </div>

      {activeTab === "fixtures" && <FixturesTab />}
      {activeTab === "users"    && <UsersTab />}
      {activeTab === "leagues"  && <LeaguesTab />}
    </div>
  );
}

// =============================================================================
// FIXTURES TAB (unchanged from original + sync)
// =============================================================================
function FixturesTab() {
  const [teams,    setTeams]    = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  const [round,    setRound]    = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoff,  setKickoff]  = useState("");
  const [venue,    setVenue]    = useState("");
  const [groupLbl, setGroupLbl] = useState("");
  const [creating, setCreating] = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [syncLog,  setSyncLog]  = useState([]);
  const [nextSync, setNextSync] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: teamRows }, { data: fxRows, error: fxErr }] = await Promise.all([
        supabase.from("teams").select("id,name,fifa_code,flag_emoji").order("name"),
        supabase.from("fixtures")
          .select(`id,round,group_label,kickoff_at,venue,status,
                   home_score,away_score,went_to_penalties,
                   home_team:home_team_id(id,name,fifa_code),
                   away_team:away_team_id(id,name,fifa_code)`)
          .order("kickoff_at", { ascending: true }),
      ]);
      if (fxErr) throw fxErr;
      setTeams(teamRows ?? []);
      setFixtures(fxRows ?? []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function addLog(msg, isError = false) {
    setSyncLog((prev) => [{ ts: new Date().toLocaleTimeString(), msg, isError }, ...prev.slice(0, 19)]);
  }

  async function runSync() {
    setSyncing(true); setError(""); setSuccess("");
    addLog("Starting sync from openfootball/worldcup.json…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/public/hooks/sync-fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const msg = `✅ ${data.totalMatches} matches · ${data.fixturesUpserted} upserted · ${data.scoresUpdated} scored`;
      addLog(msg); setSuccess(msg);
      if (data.warnings?.length) data.warnings.forEach((w) => addLog(`⚠ ${w}`, true));
      setNextSync(new Date(Date.now() + 15 * 60 * 1000));
      await load();
    } catch (err) { addLog(`❌ ${err.message}`, true); setError(`Sync failed: ${err.message}`); }
    finally { setSyncing(false); }
  }

  async function handleCreateFixture(e) {
    e.preventDefault(); setError(""); setSuccess("");
    if (homeTeam === awayTeam) { setError("Home and away teams must differ."); return; }
    setCreating(true);
    try {
      const { error: ie } = await supabase.from("fixtures").insert({
        round, group_label: groupLbl || null, home_team_id: homeTeam, away_team_id: awayTeam,
        kickoff_at: new Date(kickoff).toISOString(), venue: venue || null, status: "scheduled",
      });
      if (ie) throw ie;
      setSuccess("Fixture added.");
      setRound(""); setHomeTeam(""); setAwayTeam(""); setKickoff(""); setVenue(""); setGroupLbl("");
      await load();
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  }

  async function handleUpdateResult(fixtureId, updates) {
    setError(""); setSuccess("");
    try {
      const { error: ue } = await supabase.from("fixtures").update(updates).eq("id", fixtureId);
      if (ue) throw ue;
      setSuccess("Result saved — predictions rescored automatically.");
      await load();
    } catch (err) { setError(err.message); }
  }

  const totalFx   = fixtures.length;
  const finished  = fixtures.filter((f) => f.status === "finished").length;
  const live      = fixtures.filter((f) => f.status === "live").length;
  const scheduled = fixtures.filter((f) => f.status === "scheduled").length;

  return (
    <>
      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="grid grid-4">
        {[
          { label: "Total Fixtures", value: totalFx },
          { label: "🔴 Live",        value: live,      color: "var(--red)" },
          { label: "✅ Finished",    value: finished,  color: "var(--green)" },
          { label: "⏰ Upcoming",    value: scheduled, color: "var(--blue)" },
        ].map(({ label, value, color }) => (
          <div className="card stat-card" key={label}>
            <div className="label">{label}</div>
            <div className="value" style={color ? { color } : {}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Sync */}
      <div className="card mt-24">
        <div className="flex-between">
          <div>
            <h3 style={{ margin: 0 }}>Live Data Sync</h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.83rem" }}>
              Source: <code>openfootball/worldcup.json</code> — auto-polls every 15 min.
              {nextSync && <> Next ~{nextSync.toLocaleTimeString()}.</>}
            </p>
          </div>
          <button className="btn" onClick={runSync} disabled={syncing} style={{ whiteSpace: "nowrap" }}>
            {syncing ? "Syncing…" : "⟳  Sync Now"}
          </button>
        </div>
        {syncLog.length > 0 && (
          <div style={{ marginTop: 12, background: "var(--bg)", borderRadius: 8, padding: 10, fontFamily: "monospace", fontSize: "0.78rem", maxHeight: 160, overflowY: "auto" }}>
            {syncLog.map(({ ts, msg, isError }, i) => (
              <div key={i} style={{ color: isError ? "var(--red)" : "var(--text-dim)", marginBottom: 2 }}>
                <span style={{ opacity: 0.5 }}>[{ts}]</span> {msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add fixture */}
      <div className="card mt-24">
        <h3>Add Fixture Manually</h3>
        <form onSubmit={handleCreateFixture}>
          <div className="grid grid-3">
            <div className="field"><label>Round / Stage</label>
              <input value={round} onChange={(e) => setRound(e.target.value)} placeholder="e.g. Round of 16" required /></div>
            <div className="field"><label>Group label (optional)</label>
              <input value={groupLbl} onChange={(e) => setGroupLbl(e.target.value)} placeholder="e.g. Group A" /></div>
            <div className="field"><label>Venue</label>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. MetLife Stadium" /></div>
            <div className="field"><label>Home Team</label>
              <select value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} required>
                <option value="">Select…</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.flag_emoji} {t.name}</option>)}
              </select></div>
            <div className="field"><label>Away Team</label>
              <select value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} required>
                <option value="">Select…</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.flag_emoji} {t.name}</option>)}
              </select></div>
            <div className="field"><label>Kickoff (local time)</label>
              <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} required /></div>
          </div>
          <button className="btn" type="submit" disabled={creating}>{creating ? "Adding…" : "Add Fixture"}</button>
        </form>
      </div>

      {/* Fixtures table */}
      <div className="card mt-24">
        <h3>All Fixtures ({totalFx})</h3>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          Enter <strong>regulation/extra-time score only</strong>. Check "Pens?" for shootouts.
        </p>
        {loading ? <div className="muted center" style={{ padding: 24 }}>Loading…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Match</th><th>Stage</th><th>Kickoff</th><th>Status</th><th>Score (90+ET)</th><th>Pens?</th><th></th></tr></thead>
              <tbody>{fixtures.map((f) => <FixtureRow key={f.id} fixture={f} onSave={handleUpdateResult} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function FixtureRow({ fixture, onSave }) {
  const [hs, setHs]       = useState(fixture.home_score ?? "");
  const [as_, setAs]      = useState(fixture.away_score ?? "");
  const [pens, setPens]   = useState(fixture.went_to_penalties);
  const [status, setStatus] = useState(fixture.status);
  const [dirty, setDirty] = useState(false);
  function mark() { setDirty(true); }
  function handleSave() {
    onSave(fixture.id, { status, home_score: hs === "" ? null : Number(hs), away_score: as_ === "" ? null : Number(as_), went_to_penalties: pens });
    setDirty(false);
  }
  const ft = fixture.home_score != null ? `${fixture.home_score}–${fixture.away_score}` : "—";
  return (
    <tr style={dirty ? { background: "rgba(232,185,74,0.06)" } : {}}>
      <td style={{ fontWeight: 600 }}>{teamShortLabel(fixture.home_team)} vs {teamShortLabel(fixture.away_team)}</td>
      <td className="muted" style={{ fontSize: "0.78rem" }}>{fixture.group_label ? `${fixture.group_label} · ` : ""}{fixture.round}</td>
      <td className="muted" style={{ fontSize: "0.75rem" }}>{new Date(fixture.kickoff_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
      <td><select value={status} onChange={(e) => { setStatus(e.target.value); mark(); }} style={{ width: 110, fontSize: "0.82rem" }}>
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
      <td>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="number" min={0} value={hs} onChange={(e) => { setHs(e.target.value); mark(); }} style={{ width: 46, textAlign: "center" }} />
          <span className="muted">–</span>
          <input type="number" min={0} value={as_} onChange={(e) => { setAs(e.target.value); mark(); }} style={{ width: 46, textAlign: "center" }} />
        </div>
        <div className="muted" style={{ fontSize: "0.65rem" }}>current: {ft}</div>
      </td>
      <td style={{ textAlign: "center" }}><input type="checkbox" checked={pens} onChange={(e) => { setPens(e.target.checked); mark(); }} /></td>
      <td><button className={`btn small ${dirty ? "" : "secondary"}`} onClick={handleSave}>Save</button></td>
    </tr>
  );
}

// =============================================================================
// USERS TAB
// =============================================================================
function UsersTab() {
  const [users,       setUsers]       = useState([]);
  const [teams,       setTeams]       = useState([]);
  const [fixtures,    setFixtures]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPreds,   setUserPreds]   = useState([]);
  const [predsLoading, setPredsLoading] = useState(false);
  const [showFavModal, setShowFavModal] = useState(false);
  const [showPredModal, setShowPredModal] = useState(false);
  const [favA,        setFavA]        = useState("");
  const [favB,        setFavB]        = useState("");
  const [predFixture, setPredFixture] = useState("");
  const [predOutcome, setPredOutcome] = useState("home_win");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: u }, { data: t }, { data: f }] = await Promise.all([
        supabase.rpc("admin_get_users"),
        supabase.from("teams").select("id,name,flag_emoji").order("name"),
        supabase.from("fixtures")
          .select("id,round,kickoff_at,home_team:home_team_id(name),away_team:away_team_id(name)")
          .order("kickoff_at", { ascending: true }),
      ]);
      setUsers(u ?? []);
      setTeams(t ?? []);
      setFixtures(f ?? []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadUserPredictions(userId) {
    setPredsLoading(true);
    const { data, error: e } = await supabase.rpc("admin_get_user_predictions", { p_user_id: userId });
    if (e) setError(e.message);
    else setUserPreds(data ?? []);
    setPredsLoading(false);
  }

  function openUser(u) {
    setSelectedUser(u);
    setUserPreds([]);
    loadUserPredictions(u.id);
    setShowFavModal(false);
    setShowPredModal(false);
  }

  async function handleToggleAdmin(u) {
    if (!confirm(`${u.is_admin ? "Remove admin from" : "Make admin"} "${u.display_name}"?`)) return;
    setError(""); setSuccess("");
    const { error: e } = await supabase.rpc("admin_set_role", { p_user_id: u.id, p_make_admin: !u.is_admin });
    if (e) setError(e.message);
    else { setSuccess(`Role updated for ${u.display_name}`); await load(); if (selectedUser?.id === u.id) setSelectedUser((prev) => ({ ...prev, is_admin: !prev.is_admin })); }
  }

  async function handleDeleteUser(u) {
    if (!confirm(`⚠️ Permanently delete "${u.display_name}" and ALL their data? This cannot be undone.`)) return;
    setError(""); setSuccess("");
    const { error: e } = await supabase.rpc("admin_delete_user", { p_user_id: u.id });
    if (e) setError(e.message);
    else { setSuccess(`Deleted ${u.display_name}`); setSelectedUser(null); await load(); }
  }

  async function handleResetFavourites(e) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!favA || !favB || favA === favB) { setError("Select 2 different teams"); return; }
    const { error: e2 } = await supabase.rpc("admin_reset_favourites", {
      p_user_id: selectedUser.id, p_team_a: favA, p_team_b: favB, p_locked: false,
    });
    if (e2) setError(e2.message);
    else { setSuccess("Favourites updated"); setShowFavModal(false); setFavA(""); setFavB(""); await load(); }
  }

  async function handleDeletePrediction(predId) {
    if (!confirm("Delete this prediction?")) return;
    setError(""); setSuccess("");
    const { error: e } = await supabase.rpc("admin_delete_prediction", { p_prediction_id: predId });
    if (e) setError(e.message);
    else { setSuccess("Prediction deleted"); loadUserPredictions(selectedUser.id); }
  }

  async function handleAdjustPoints(predId, currentPts) {
    const newPts = prompt("New points value:", currentPts ?? 0);
    if (newPts === null) return;
    setError(""); setSuccess("");
    const { error: e } = await supabase.rpc("admin_adjust_points", {
      p_prediction_id: predId, p_points: parseInt(newPts, 10), p_goals_bonus: 0,
    });
    if (e) setError(e.message);
    else { setSuccess("Points adjusted"); loadUserPredictions(selectedUser.id); }
  }

  async function handleSetPrediction(e) {
    e.preventDefault(); setError(""); setSuccess("");
    const { error: e2 } = await supabase.rpc("admin_set_prediction", {
      p_user_id: selectedUser.id, p_fixture_id: predFixture, p_outcome: predOutcome,
    });
    if (e2) setError(e2.message);
    else { setSuccess("Prediction set"); setShowPredModal(false); setPredFixture(""); loadUserPredictions(selectedUser.id); }
  }

  if (loading) return <div className="muted center" style={{ padding: 40 }}>Loading users…</div>;

  return (
    <>
      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="grid grid-2" style={{ gap: 20 }}>
        {/* User list */}
        <div className="card" style={{ maxHeight: 600, overflowY: "auto" }}>
          <h3 style={{ marginTop: 0 }}>All Users ({users.length})</h3>
          <table>
            <thead><tr><th>Name</th><th>Pts</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={selectedUser?.id === u.id ? { background: "rgba(232,185,74,0.08)" } : {}}>
                  <td>
                    <button onClick={() => openUser(u)} style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", fontWeight: 600, padding: 0, textAlign: "left" }}>
                      {u.display_name}
                    </button>
                    <div className="muted" style={{ fontSize: "0.72rem" }}>{u.email}</div>
                  </td>
                  <td style={{ color: "var(--gold)", fontWeight: 700 }}>{u.total_points}</td>
                  <td>
                    {u.is_admin
                      ? <span style={{ color: "var(--gold)", fontSize: "0.75rem", fontWeight: 700 }}>ADMIN</span>
                      : <span className="muted" style={{ fontSize: "0.75rem" }}>user</span>}
                  </td>
                  <td>
                    <button className="btn small secondary" onClick={() => handleToggleAdmin(u)} style={{ marginRight: 4 }}>
                      {u.is_admin ? "Revoke" : "Make Admin"}
                    </button>
                    <button className="btn small danger" onClick={() => handleDeleteUser(u)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* User detail panel */}
        {selectedUser ? (
          <div className="card" style={{ maxHeight: 600, overflowY: "auto" }}>
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{selectedUser.display_name}</h3>
              <button onClick={() => setSelectedUser(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
            </div>
            <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 12px" }}>{selectedUser.email}</p>

            {/* Favourites */}
            <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 4 }}>Favourite Teams</div>
              <div className="muted" style={{ fontSize: "0.82rem" }}>
                ★1 {selectedUser.team_a_name ?? "—"} · ★2 {selectedUser.team_b_name ?? "—"}
                {selectedUser.fav_locked && <span style={{ marginLeft: 8, color: "var(--green)" }}>🔒 Locked</span>}
              </div>
              <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => { setShowFavModal(true); setShowPredModal(false); }}>
                Reset Favourites
              </button>
            </div>

            {/* Reset favourites inline form */}
            {showFavModal && (
              <form onSubmit={handleResetFavourites} style={{ background: "var(--bg)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 8 }}>Set New Favourites</div>
                <div className="grid grid-2" style={{ gap: 8, marginBottom: 8 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: "0.75rem" }}>Fav #1</label>
                    <select value={favA} onChange={(e) => setFavA(e.target.value)} required>
                      <option value="">Select…</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.flag_emoji} {t.name}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: "0.75rem" }}>Fav #2</label>
                    <select value={favB} onChange={(e) => setFavB(e.target.value)} required>
                      <option value="">Select…</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.flag_emoji} {t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn small" type="submit">Save</button>
                  <button className="btn small secondary" type="button" onClick={() => setShowFavModal(false)}>Cancel</button>
                </div>
              </form>
            )}

            {/* Set prediction on behalf */}
            <button className="btn small secondary" style={{ marginBottom: 12 }} onClick={() => { setShowPredModal(true); setShowFavModal(false); }}>
              + Set Prediction on Behalf
            </button>

            {showPredModal && (
              <form onSubmit={handleSetPrediction} style={{ background: "var(--bg)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 8 }}>Set Prediction</div>
                <div className="field" style={{ margin: "0 0 8px" }}>
                  <label style={{ fontSize: "0.75rem" }}>Fixture</label>
                  <select value={predFixture} onChange={(e) => setPredFixture(e.target.value)} required>
                    <option value="">Select…</option>
                    {fixtures.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.home_team?.name} vs {f.away_team?.name} · {new Date(f.kickoff_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ margin: "0 0 8px" }}>
                  <label style={{ fontSize: "0.75rem" }}>Outcome</label>
                  <select value={predOutcome} onChange={(e) => setPredOutcome(e.target.value)}>
                    <option value="home_win">Home Win</option>
                    <option value="draw">Draw</option>
                    <option value="away_win">Away Win</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn small" type="submit">Set</button>
                  <button className="btn small secondary" type="button" onClick={() => setShowPredModal(false)}>Cancel</button>
                </div>
              </form>
            )}

            {/* Predictions list */}
            <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 8 }}>
              Predictions ({userPreds.length})
            </div>
            {predsLoading ? (
              <div className="muted" style={{ fontSize: "0.82rem" }}>Loading…</div>
            ) : userPreds.length === 0 ? (
              <div className="muted" style={{ fontSize: "0.82rem" }}>No predictions yet.</div>
            ) : (
              <table style={{ fontSize: "0.78rem" }}>
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Pick</th>
                    <th>Result</th>
                    <th>Pts</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {userPreds.map((p) => {
                    const correct = p.points_awarded > 0;
                    const scored  = p.points_awarded != null;
                    return (
                      <tr key={p.prediction_id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.home_team} vs {p.away_team}</div>
                          <div className="muted" style={{ fontSize: "0.7rem" }}>{p.round}</div>
                        </td>
                        <td>
                          <span style={{
                            background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4,
                            fontSize: "0.72rem", fontWeight: 700,
                          }}>
                            {OUTCOME_LABELS[p.predicted_outcome]}
                          </span>
                          {p.favourite_tier && (
                            <span style={{ marginLeft: 4, fontSize: "0.65rem", color: p.favourite_tier === "primary" ? "var(--gold)" : "var(--blue)" }}>
                              ★{p.favourite_tier === "primary" ? "1" : "2"}
                            </span>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: "0.72rem" }}>
                          {p.home_score != null ? `${p.home_score}–${p.away_score}` : "—"}
                        </td>
                        <td>
                          {scored ? (
                            <span style={{
                              color: correct ? "var(--green)" : "var(--text-dim)",
                              fontWeight: 700,
                            }}>
                              {correct ? `+${p.points_awarded}` : "0"}
                            </span>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td>
                          <button className="btn small secondary" style={{ marginRight: 4, fontSize: "0.68rem" }}
                            onClick={() => handleAdjustPoints(p.prediction_id, p.points_awarded)}>
                            Pts
                          </button>
                          <button className="btn small danger" style={{ fontSize: "0.68rem" }}
                            onClick={() => handleDeletePrediction(p.prediction_id)}>
                            Del
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p className="muted">← Click a user to view their details, predictions and manage their account.</p>
          </div>
        )}
      </div>
    </>
  );
}

// =============================================================================
// LEAGUES TAB
// =============================================================================
function LeaguesTab() {
  const [leagues, setLeagues] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState(null);
  const [members,  setMembers]  = useState([]);
  const [addUserId, setAddUserId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: l }, { data: u }] = await Promise.all([
        supabase.from("leagues").select("id,name,invite_code,created_by,created_at").order("created_at", { ascending: false }),
        supabase.rpc("admin_get_users"),
      ]);
      setLeagues(l ?? []);
      setUsers(u ?? []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openLeague(league) {
    setSelected(league);
    const { data, error: e } = await supabase
      .from("league_members")
      .select("user_id, joined_at, profile:user_id(display_name, email)")
      .eq("league_id", league.id);
    if (e) setError(e.message);
    else setMembers(data ?? []);
  }

  async function handleRemoveMember(userId, userName) {
    if (!confirm(`Remove "${userName}" from "${selected.name}"?`)) return;
    setError(""); setSuccess("");
    const { error: e } = await supabase.rpc("admin_remove_from_league", {
      p_league_id: selected.id, p_user_id: userId,
    });
    if (e) setError(e.message);
    else { setSuccess(`Removed ${userName}`); openLeague(selected); }
  }

  async function handleAddMember(e) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!addUserId) return;
    const { error: e2 } = await supabase.rpc("admin_add_to_league", {
      p_league_id: selected.id, p_user_id: addUserId,
    });
    if (e2) setError(e2.message);
    else {
      const u = users.find((u) => u.id === addUserId);
      setSuccess(`Added ${u?.display_name ?? addUserId} to ${selected.name}`);
      setAddUserId("");
      openLeague(selected);
    }
  }

  async function handleDeleteLeague(league) {
    if (!confirm(`Delete league "${league.name}" and remove all members?`)) return;
    setError(""); setSuccess("");
    const { error: e } = await supabase.from("leagues").delete().eq("id", league.id);
    if (e) setError(e.message);
    else { setSuccess(`Deleted "${league.name}"`); setSelected(null); await load(); }
  }

  if (loading) return <div className="muted center" style={{ padding: 40 }}>Loading leagues…</div>;

  return (
    <>
      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="grid grid-2" style={{ gap: 20 }}>
        {/* League list */}
        <div className="card" style={{ maxHeight: 600, overflowY: "auto" }}>
          <h3 style={{ marginTop: 0 }}>All Leagues ({leagues.length})</h3>
          {leagues.length === 0 ? (
            <div className="muted center" style={{ padding: 24 }}>No leagues created yet.</div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Code</th><th></th></tr></thead>
              <tbody>
                {leagues.map((l) => (
                  <tr key={l.id} style={selected?.id === l.id ? { background: "rgba(232,185,74,0.08)" } : {}}>
                    <td>
                      <button onClick={() => openLeague(l)} style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                        {l.name}
                      </button>
                    </td>
                    <td>
                      <code style={{ color: "var(--gold)", fontWeight: 700, fontSize: "0.85rem" }}>{l.invite_code}</code>
                    </td>
                    <td>
                      <button className="btn small danger" onClick={() => handleDeleteLeague(l)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* League detail */}
        {selected ? (
          <div className="card" style={{ maxHeight: 600, overflowY: "auto" }}>
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{selected.name}</h3>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
            </div>
            <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 16 }}>
              Invite code: <code style={{ color: "var(--gold)", fontWeight: 700 }}>{selected.invite_code}</code>
            </div>

            {/* Add member */}
            <form onSubmit={handleAddMember} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} required style={{ flex: 1 }}>
                <option value="">Add user to league…</option>
                {users
                  .filter((u) => !members.some((m) => m.user_id === u.id))
                  .map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
              <button className="btn small" type="submit">Add</button>
            </form>

            {/* Members list */}
            <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 8 }}>Members ({members.length})</div>
            {members.length === 0 ? (
              <div className="muted" style={{ fontSize: "0.82rem" }}>No members yet.</div>
            ) : (
              <table style={{ fontSize: "0.82rem" }}>
                <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th></th></tr></thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.user_id}>
                      <td style={{ fontWeight: 600 }}>{m.profile?.display_name ?? "—"}</td>
                      <td className="muted" style={{ fontSize: "0.72rem" }}>{m.profile?.email ?? "—"}</td>
                      <td className="muted" style={{ fontSize: "0.72rem" }}>{new Date(m.joined_at).toLocaleDateString()}</td>
                      <td>
                        <button className="btn small danger" onClick={() => handleRemoveMember(m.user_id, m.profile?.display_name)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p className="muted">← Click a league to manage its members.</p>
          </div>
        )}
      </div>
    </>
  );
}