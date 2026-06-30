import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function Leagues() {
  const { user, profile } = useAuth();

  const [myLeagues,   setMyLeagues]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");

  // Create form
  const [newName,     setNewName]     = useState("");
  const [creating,    setCreating]    = useState(false);

  // Join form
  const [joinCode,    setJoinCode]    = useState("");
  const [joining,     setJoining]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Get all leagues the user is a member of
      const { data, error: err } = await supabase
        .from("league_members")
        .select(`
          joined_at,
          league:league_id (
            id, name, invite_code, created_by, created_at
          )
        `)
        .eq("user_id", user.id);
      if (err) throw err;
      setMyLeagues((data ?? []).map((r) => r.league));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  // ── Create league ─────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!newName.trim()) return;
    setCreating(true);
    try {
      // 1. Create the league
      const { data: league, error: le } = await supabase
        .from("leagues")
        .insert({ name: newName.trim(), created_by: user.id })
        .select()
        .single();
      if (le) throw le;

      // 2. Auto-join creator
      const { error: me } = await supabase
        .from("league_members")
        .insert({ league_id: league.id, user_id: user.id });
      if (me) throw me;

      setSuccess(`League "${league.name}" created! Invite code: ${league.invite_code}`);
      setNewName("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Join league ───────────────────────────────────────────────────────────
  async function handleJoin(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    try {
      // Find league by invite code
      const { data: league, error: le } = await supabase
        .from("leagues")
        .select("id, name")
        .eq("invite_code", code)
        .maybeSingle();
      if (le) throw le;
      if (!league) throw new Error(`No league found with code "${code}"`);

      // Check already a member
      const already = myLeagues.find((l) => l.id === league.id);
      if (already) throw new Error(`You're already in "${league.name}"`);

      // Join
      const { error: me } = await supabase
        .from("league_members")
        .insert({ league_id: league.id, user_id: user.id });
      if (me) throw me;

      setSuccess(`Joined "${league.name}" successfully!`);
      setJoinCode("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  }

  // ── Leave league ──────────────────────────────────────────────────────────
  async function handleLeave(leagueId, leagueName) {
    if (!confirm(`Leave "${leagueName}"?`)) return;
    setError(""); setSuccess("");
    try {
      const { error: err } = await supabase
        .from("league_members")
        .delete()
        .eq("league_id", leagueId)
        .eq("user_id", user.id);
      if (err) throw err;
      setSuccess(`Left "${leagueName}"`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>🏆 My Leagues</h1>
        <p>Create a private league for your friend circle or join one with an invite code.</p>
      </div>

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="grid grid-2" style={{ marginBottom: 24 }}>
        {/* Create */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Create a League</h3>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label>League name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Family Cup 2026"
                required
                disabled={creating}
              />
            </div>
            <button className="btn" type="submit" disabled={creating || !newName.trim()}>
              {creating ? "Creating…" : "Create League"}
            </button>
          </form>
        </div>

        {/* Join */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Join a League</h3>
          <form onSubmit={handleJoin}>
            <div className="field">
              <label>Invite code</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                maxLength={6}
                required
                disabled={joining}
                style={{ letterSpacing: "0.15em", fontWeight: 700 }}
              />
            </div>
            <button className="btn" type="submit" disabled={joining || !joinCode.trim()}>
              {joining ? "Joining…" : "Join League"}
            </button>
          </form>
        </div>
      </div>

      {/* My leagues list */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Your Leagues ({myLeagues.length})</h3>
        {loading ? (
          <div className="muted center" style={{ padding: 24 }}>Loading…</div>
        ) : myLeagues.length === 0 ? (
          <div className="muted center" style={{ padding: 24 }}>
            You haven't joined any leagues yet. Create one or ask a friend for their invite code.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>League</th>
                <th>Invite Code</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {myLeagues.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.name}</td>
                  <td>
                    <code style={{
                      background: "var(--surface-2)", padding: "2px 8px",
                      borderRadius: 6, letterSpacing: "0.1em", fontSize: "0.9rem",
                      color: "var(--gold)", fontWeight: 700,
                    }}>
                      {l.invite_code}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(l.invite_code); setSuccess("Copied!"); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--blue)", marginLeft: 8, fontSize: "0.8rem" }}
                    >
                      Copy
                    </button>
                  </td>
                  <td className="muted" style={{ fontSize: "0.82rem" }}>
                    {l.created_by === user.id ? "👑 Owner" : "Member"}
                  </td>
                  <td>
                    {l.created_by !== user.id && (
                      <button
                        className="btn small secondary"
                        onClick={() => handleLeave(l.id, l.name)}
                      >
                        Leave
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
