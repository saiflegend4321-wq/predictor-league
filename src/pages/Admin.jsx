import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

const STATUS_OPTIONS = ["scheduled","live","finished","postponed"];

export default function Admin() {
  const [teams,    setTeams]    = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  // New fixture form
  const [round,     setRound]     = useState("");
  const [homeTeam,  setHomeTeam]  = useState("");
  const [awayTeam,  setAwayTeam]  = useState("");
  const [kickoff,   setKickoff]   = useState("");
  const [venue,     setVenue]     = useState("");
  const [groupLbl,  setGroupLbl]  = useState("");
  const [creating,  setCreating]  = useState(false);

  // Sync state
  const [syncing,    setSyncing]    = useState(false);
  const [syncLog,    setSyncLog]    = useState([]);
  const [nextSync,   setNextSync]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: teamRows }, { data: fxRows, error: fxErr }] = await Promise.all([
        supabase.from("teams").select("id,name,fifa_code,flag_emoji").order("name"),
        supabase
          .from("fixtures")
          .select(`id,round,group_label,kickoff_at,venue,status,
                   home_score,away_score,went_to_penalties,
                   home_team:home_team_id(id,name,fifa_code),
                   away_team:away_team_id(id,name,fifa_code)`)
          .order("kickoff_at", { ascending: true }),
      ]);
      if (fxErr) throw fxErr;
      setTeams(teamRows ?? []);
      setFixtures(fxRows ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Sync ─────────────────────────────────────────────────────────────────
  function addLog(msg, isError = false) {
    setSyncLog((prev) => [
      { ts: new Date().toLocaleTimeString(), msg, isError },
      ...prev.slice(0, 19),
    ]);
  }

  async function runSync() {
    setSyncing(true);
    setError("");
    setSuccess("");
    addLog("Starting sync from openfootball/worldcup.json…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/public/hooks/sync-fixtures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      const msg = `✅ ${data.totalMatches} matches · ${data.fixturesUpserted} upserted · ${data.scoresUpdated} scored`;
      addLog(msg);
      setSuccess(msg);

      if (data.warnings?.length) {
        data.warnings.forEach((w) => addLog(`⚠ ${w}`, true));
      }

      // Schedule next auto-display (server actually auto-polls every 15 min)
      const next = new Date(Date.now() + 15 * 60 * 1000);
      setNextSync(next);

      await load();
    } catch (err) {
      addLog(`❌ ${err.message}`, true);
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  // ── Add fixture ───────────────────────────────────────────────────────────
  async function handleCreateFixture(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (homeTeam === awayTeam) { setError("Home and away teams must differ."); return; }
    setCreating(true);
    try {
      const { error: ie } = await supabase.from("fixtures").insert({
        round,
        group_label: groupLbl || null,
        home_team_id: homeTeam,
        away_team_id: awayTeam,
        kickoff_at:  new Date(kickoff).toISOString(),
        venue:       venue || null,
        status:      "scheduled",
      });
      if (ie) throw ie;
      setSuccess("Fixture added.");
      setRound(""); setHomeTeam(""); setAwayTeam(""); setKickoff("");
      setVenue(""); setGroupLbl("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Update result ─────────────────────────────────────────────────────────
  async function handleUpdateResult(fixtureId, updates) {
    setError(""); setSuccess("");
    try {
      const { error: ue } = await supabase.from("fixtures").update(updates).eq("id", fixtureId);
      if (ue) throw ue;
      setSuccess("Result saved — predictions rescored automatically.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Summary stats
  const totalFx   = fixtures.length;
  const finished  = fixtures.filter((f) => f.status === "finished").length;
  const live      = fixtures.filter((f) => f.status === "live").length;
  const scheduled = fixtures.filter((f) => f.status === "scheduled").length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Admin Panel</h1>
        <p>Manage fixtures, enter scores, and sync live data from openfootball.</p>
      </div>

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {/* Summary tiles */}
      <div className="grid grid-4">
        {[
          { label: "Total Fixtures", value: totalFx },
          { label: "🔴 Live",       value: live,      color: "var(--red)" },
          { label: "✅ Finished",    value: finished,  color: "var(--green)" },
          { label: "⏰ Upcoming",    value: scheduled, color: "var(--blue)" },
        ].map(({ label, value, color }) => (
          <div className="card stat-card" key={label}>
            <div className="label">{label}</div>
            <div className="value" style={color ? { color } : {}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Sync card */}
      <div className="card mt-24">
        <div className="flex-between">
          <div>
            <h3 style={{ margin: 0 }}>Live Data Sync</h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.83rem" }}>
              Source: <code>openfootball/worldcup.json</code> on GitHub — no API key,
              updates automatically as matches finish. Server auto-polls every 15 min.
              {nextSync && (
                <> Next auto-sync ~{nextSync.toLocaleTimeString()}.</>
              )}
            </p>
          </div>
          <button className="btn" onClick={runSync} disabled={syncing} style={{ whiteSpace: "nowrap" }}>
            {syncing ? "Syncing…" : "⟳  Sync Now"}
          </button>
        </div>

        {syncLog.length > 0 && (
          <div style={{
            marginTop: 12,
            background: "var(--bg)", borderRadius: 8, padding: 10,
            fontFamily: "monospace", fontSize: "0.78rem", maxHeight: 160, overflowY: "auto",
          }}>
            {syncLog.map(({ ts, msg, isError }, i) => (
              <div key={i} style={{ color: isError ? "var(--red)" : "var(--text-dim)", marginBottom: 2 }}>
                <span style={{ opacity: 0.5 }}>[{ts}]</span> {msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add fixture manually */}
      <div className="card mt-24">
        <h3>Add Fixture Manually</h3>
        <form onSubmit={handleCreateFixture}>
          <div className="grid grid-3">
            <div className="field">
              <label>Round / Stage</label>
              <input value={round} onChange={(e) => setRound(e.target.value)}
                placeholder="e.g. Round of 16, Final" required />
            </div>
            <div className="field">
              <label>Group label (optional)</label>
              <input value={groupLbl} onChange={(e) => setGroupLbl(e.target.value)}
                placeholder="e.g. Group A" />
            </div>
            <div className="field">
              <label>Venue</label>
              <input value={venue} onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. MetLife Stadium" />
            </div>
            <div className="field">
              <label>Home Team</label>
              <select value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} required>
                <option value="">Select…</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.flag_emoji} {t.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Away Team</label>
              <select value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} required>
                <option value="">Select…</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.flag_emoji} {t.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Kickoff (your local time)</label>
              <input type="datetime-local" value={kickoff}
                onChange={(e) => setKickoff(e.target.value)} required />
            </div>
          </div>
          <button className="btn" type="submit" disabled={creating}>
            {creating ? "Adding…" : "Add Fixture"}
          </button>
        </form>
      </div>

      {/* Fixtures table */}
      <div className="card mt-24">
        <h3>All Fixtures ({totalFx})</h3>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          Enter the <strong>regulation/extra-time score only</strong> — never include penalty
          shootout goals. Check "Pens?" if the match went to a shootout. Saving triggers
          automatic rescoring of all predictions.
        </p>
        {loading ? (
          <div className="muted center" style={{ padding: 24 }}>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Stage</th>
                  <th>Kickoff</th>
                  <th>Status</th>
                  <th>Score (90+ET)</th>
                  <th>Pens?</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fixtures.map((f) => (
                  <FixtureRow key={f.id} fixture={f} onSave={handleUpdateResult} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline editable row ───────────────────────────────────────────────────────
function FixtureRow({ fixture, onSave }) {
  const [hs,     setHs]    = useState(fixture.home_score ?? "");
  const [as_,    setAs]    = useState(fixture.away_score ?? "");
  const [pens,   setPens]  = useState(fixture.went_to_penalties);
  const [status, setStatus] = useState(fixture.status);
  const [dirty,  setDirty]  = useState(false);

  function mark() { setDirty(true); }

  function handleSave() {
    onSave(fixture.id, {
      status,
      home_score:        hs === "" ? null : Number(hs),
      away_score:        as_ === "" ? null : Number(as_),
      went_to_penalties: pens,
    });
    setDirty(false);
  }

  const ft = fixture.home_score != null
    ? `${fixture.home_score}–${fixture.away_score}`
    : "—";

  return (
    <tr style={dirty ? { background: "rgba(232,185,74,0.06)" } : {}}>
      <td style={{ fontWeight: 600 }}>
        {fixture.home_team.fifa_code} vs {fixture.away_team.fifa_code}
      </td>
      <td className="muted" style={{ fontSize: "0.78rem" }}>
        {fixture.group_label ? `${fixture.group_label} · ` : ""}{fixture.round}
      </td>
      <td className="muted" style={{ fontSize: "0.75rem" }}>
        {new Date(fixture.kickoff_at).toLocaleString(undefined, {
          dateStyle: "short", timeStyle: "short",
        })}
      </td>
      <td>
        <select value={status} onChange={(e) => { setStatus(e.target.value); mark(); }}
          style={{ width: 110, fontSize: "0.82rem" }}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="number" min={0} value={hs}
            onChange={(e) => { setHs(e.target.value); mark(); }}
            style={{ width: 46, textAlign: "center" }} />
          <span className="muted">–</span>
          <input type="number" min={0} value={as_}
            onChange={(e) => { setAs(e.target.value); mark(); }}
            style={{ width: 46, textAlign: "center" }} />
        </div>
        <div className="muted" style={{ fontSize: "0.65rem" }}>current: {ft}</div>
      </td>
      <td style={{ textAlign: "center" }}>
        <input type="checkbox" checked={pens}
          onChange={(e) => { setPens(e.target.checked); mark(); }} />
      </td>
      <td>
        <button
          className={`btn small ${dirty ? "" : "secondary"}`}
          onClick={handleSave}
        >
          Save
        </button>
      </td>
    </tr>
  );
}
