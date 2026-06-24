import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [lastSync, setLastSync] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_leaderboard");
      if (rpcErr) throw rpcErr;
      setRows(data ?? []);
      setLastSync(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    // Re-fetch leaderboard whenever any prediction is scored (points_awarded changes)
    const sub = supabase
      .channel("leaderboard-refresh")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "predictions" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "predictions" },
        () => load()
      )
      .subscribe();

    return () => supabase.removeChannel(sub);
  }, [load]);

  const myRank = rows.find((r) => r.user_id === user?.id)?.rank;

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

      <div className="card">
        {loading ? (
          <div className="muted center" style={{ padding: 40 }}>Loading standings…</div>
        ) : rows.length === 0 ? (
          <div className="muted center" style={{ padding: 40 }}>
            No managers yet — be the first to make a prediction!
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
                return (
                  <tr
                    key={r.user_id}
                    className={`leaderboard-row ${r.rank <= 3 ? `rank-${r.rank}` : ""}`}
                    style={isMe ? { outline: "1px solid var(--gold)", outlineOffset: -1 } : {}}
                  >
                    <td style={{ textAlign: "center", fontSize: "1.1rem" }}>
                      {MEDALS[r.rank] ?? `#${r.rank}`}
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
