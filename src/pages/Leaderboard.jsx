import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import Skeleton from "../components/Skeleton";

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function Leaderboard() {
  const { user } = useAuth();

  // ── Login gate ────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 480, margin: "60px auto", textAlign: "center", padding: "40px 32px" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🏆</div>
          <h2 style={{ marginTop: 0 }}>Sign in to see the Leaderboard</h2>
          <p className="muted">
            The leaderboard is only visible to registered managers.
            Sign up free — it only takes 30 seconds.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
            <Link className="btn" to="/auth">Sign in / Register</Link>
          </div>
        </div>
      </div>
    );
  }

  return <LeaderboardInner />;
}

// ── Inner component (only renders when logged in) ─────────────────────────────
function LeaderboardInner() {
  const { user } = useAuth();

  const [activeTab,  setActiveTab]  = useState("global");
  const [myLeagues,  setMyLeagues]  = useState([]);
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [lastSync,   setLastSync]   = useState(null);
  const [rowDeltas,  setRowDeltas]  = useState({}); // user_id -> 'up' | 'down' | 'same'
  const [flashIds,   setFlashIds]   = useState({});  // user_id -> 'up' | 'down', cleared after animation

  const prevRanksRef = useRef({}); // user_id -> previous rank

  // Load user's leagues for tab list
  useEffect(() => {
    supabase
      .from("league_members")
      .select("league:league_id(id, name)")
      .eq("user_id", user.id)
      .then(({ data }) => setMyLeagues((data ?? []).map((r) => r.league)));
  }, [user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let data, rpcErr;
      if (activeTab === "global") {
        ({ data, error: rpcErr } = await supabase.rpc("get_leaderboard"));
      } else {
        ({ data, error: rpcErr } = await supabase.rpc("get_league_leaderboard", {
          p_league_id: activeTab,
        }));
      }
      if (rpcErr) throw rpcErr;
      const newRows = data ?? [];

      // Compute rank deltas vs previous snapshot
      const deltas = {};
      const flashes = {};
      for (const r of newRows) {
        const prevRank = prevRanksRef.current[r.user_id];
        if (prevRank == null) {
          deltas[r.user_id] = "same";
        } else if (r.rank < prevRank) {
          deltas[r.user_id] = "up";
          flashes[r.user_id] = "up";
        } else if (r.rank > prevRank) {
          deltas[r.user_id] = "down";
          flashes[r.user_id] = "down";
        } else {
          deltas[r.user_id] = "same";
        }
      }
      prevRanksRef.current = Object.fromEntries(newRows.map((r) => [r.user_id, r.rank]));

      setRows(newRows);
      setRowDeltas(deltas);
      setFlashIds(flashes);
      setLastSync(new Date());

      // Clear flash classes after animation completes
      if (Object.keys(flashes).length > 0) {
        setTimeout(() => setFlashIds({}), 1700);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  // Realtime refresh on prediction updates
  useEffect(() => {
    const sub = supabase
      .channel("leaderboard-refresh")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "predictions" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "predictions" }, load)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [load]);

  const myRank = rows.find((r) => r.user_id === user?.id)?.rank;

  const tabs = [
    { id: "global", label: "🌍 Global" },
    ...myLeagues.map((l) => ({ id: l.id, label: `🏆 ${l.name}` })),
  ];

  return (
    <div className="page">
      <div className="flex-between page-header">
        <div>
          <h1>🏆 Leaderboard</h1>
          <p>Updates live as match results are entered. Tiebreak: most correct predictions.</p>
        </div>
        <div style={{ textAlign: "right" }}>
          {myRank && (
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--gold)" }}>
              {MEDALS[myRank] ?? `#${myRank}`} Your rank
            </div>
          )}
          {lastSync && (
            <div className="muted" style={{ fontSize: "0.72rem" }}>
              Updated {lastSync.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Tabs: Global + each league */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={activeTab === t.id ? "active" : ""}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <Link
          to="/leagues"
          style={{
            padding: "8px 16px", borderRadius: "999px", border: "1px dashed var(--border)",
            color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          + My Leagues
        </Link>
      </div>

      <div className="card">
        {loading ? (
          <Skeleton.Row count={8} />
        ) : rows.length === 0 ? (
          <div className="muted center" style={{ padding: 40 }}>
            {activeTab === "global"
              ? "No managers yet — be the first to make a prediction!"
              : "No members in this league yet. Share your invite code!"}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 50 }}>Rank</th>
                <th>Manager</th>
                <th>Favourites</th>
                <th style={{ width: 80 }}>Correct</th>
                <th style={{ width: 80 }}>Played</th>
                <th style={{ width: 80 }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isMe = r.user_id === user?.id;
                const delta = rowDeltas[r.user_id];
                const flash = flashIds[r.user_id];
                return (
                  <tr
                    key={r.user_id}
                    className={[
                      "leaderboard-row",
                      r.rank <= 3 ? `rank-${r.rank}` : "",
                      flash === "up" ? "flash-up" : "",
                      flash === "down" ? "flash-down" : "",
                    ].join(" ")}
                    style={isMe ? { outline: "1px solid var(--gold)", outlineOffset: -1 } : {}}
                  >
                    <td style={{ textAlign: "center", fontSize: "1.1rem" }}>
                      {MEDALS[r.rank] ?? `#${r.rank}`}
                      {delta === "up" && <span className="rank-delta up">▲</span>}
                      {delta === "down" && <span className="rank-delta down">▼</span>}
                    </td>
                    <td>
                      <strong>{r.display_name}</strong>
                      {isMe && (
                        <span className="muted" style={{ fontSize: "0.72rem", marginLeft: 6 }}>
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: "0.8rem" }}>
                      {r.team_a_name ? (
                        <>
                          <span style={{ color: "var(--gold)" }}>★1</span> {r.team_a_name}
                          {" · "}
                          <span style={{ color: "var(--blue)" }}>★2</span> {r.team_b_name}
                        </>
                      ) : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        background: "rgba(47,174,107,0.15)", color: "var(--green)",
                        padding: "2px 8px", borderRadius: 999, fontSize: "0.8rem", fontWeight: 700,
                      }}>
                        {r.correct_predictions}
                      </span>
                    </td>
                    <td className="muted" style={{ textAlign: "center", fontSize: "0.85rem" }}>
                      {r.scored_predictions} / {r.total_predictions}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <strong style={{ fontSize: "1.1rem", color: "var(--gold)" }}>
                        {r.total_points}
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
