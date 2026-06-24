import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { SCORING_RULES, PENALTY_RULE } from "../lib/scoringRules";

function useStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      const [{ count: totalFx }, { data: live }, { count: managers }] =
        await Promise.all([
          supabase.from("fixtures").select("*", { count: "exact", head: true }),
          supabase.from("fixtures").select("id").eq("status", "live"),
          supabase.from("profiles").select("*", { count: "exact", head: true }),
        ]);
      setStats({
        totalFixtures: totalFx ?? 0,
        liveNow:       (live ?? []).length,
        managers:      managers ?? 0,
      });
    }
    load();
  }, []);

  return stats;
}

export default function Home() {
  const { user } = useAuth();
  const stats    = useStats();

  return (
    <div className="page">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="hero">
        <div style={{ fontSize: "3rem", marginBottom: 8 }}>⚽🏆</div>
        <h1>FIFA World Cup 2026<br />Fantasy Predictor</h1>
        <p>
          Pick your two favourite teams, predict every match, and earn points
          based on goals. Real fixtures, live scores, and automatic leaderboard
          updates — all in one place.
        </p>
        <div className="cta-row">
          {user ? (
            <>
              <Link className="btn" to="/fixtures">Make Predictions</Link>
              <Link className="btn secondary" to="/leaderboard">Leaderboard</Link>
            </>
          ) : (
            <>
              <Link className="btn" to="/auth">Join the League</Link>
              <Link className="btn secondary" to="/rules">See the Rules</Link>
            </>
          )}
        </div>
      </div>

      {/* ── Live stats ticker ──────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-3" style={{ marginBottom: 32 }}>
          <div className="card stat-card" style={{ textAlign: "center" }}>
            <div className="label">Fixtures</div>
            <div className="value">{stats.totalFixtures}</div>
          </div>
          <div className="card stat-card" style={{ textAlign: "center" }}>
            <div className="label">🔴 Live Now</div>
            <div className="value" style={{ color: stats.liveNow > 0 ? "var(--red)" : undefined }}>
              {stats.liveNow}
            </div>
          </div>
          <div className="card stat-card" style={{ textAlign: "center" }}>
            <div className="label">Managers Signed Up</div>
            <div className="value">{stats.managers}</div>
          </div>
        </div>
      )}

      {/* ── How it works ──────────────────────────────────────────────── */}
      <div className="grid grid-3" style={{ marginBottom: 32 }}>
        {[
          {
            icon: "⭐",
            title: "1. Pick Your Favourites",
            body: "Choose 2 favourite nations before the tournament. They earn bonus points whenever they play — your #1 earns more than your #2.",
          },
          {
            icon: "🎯",
            title: "2. Predict Every Match",
            body: "Back your favourites (mandatory when they play) or freely predict any match. Predictions lock automatically at kickoff.",
          },
          {
            icon: "📊",
            title: "3. Earn Points",
            body: "Correct predictions earn 6 or 3 base points (depending on your favourite tier) plus 1 point for every goal your team scores.",
          },
        ].map(({ icon, title, body }) => (
          <div key={title} className="card">
            <div style={{ fontSize: "2rem", marginBottom: 10 }}>{icon}</div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>{title}</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.87rem", lineHeight: 1.55 }}>{body}</p>
          </div>
        ))}
      </div>

      {/* ── Scoring summary ───────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 32 }}>
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Scoring at a Glance</h3>
          <Link to="/rules" style={{ fontSize: "0.85rem" }}>Full rules →</Link>
        </div>
        <div className="rules-list">
          {SCORING_RULES.map((r) => (
            <div key={r.id} className="rule-item">
              <div className="rule-points">{r.points}+</div>
              <div className="rule-text">
                <strong>{r.label}</strong>
                <span>{r.description}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="info-banner" style={{ marginTop: 16, marginBottom: 0 }}>
          ⚠️ {PENALTY_RULE}
        </div>
      </div>

      {/* ── CTA if not signed in ──────────────────────────────────────── */}
      {!user && (
        <div className="card" style={{ textAlign: "center", padding: "36px 24px" }}>
          <h2 style={{ marginTop: 0 }}>Ready to play?</h2>
          <p className="muted">Sign up free — it only takes 30 seconds.</p>
          <Link className="btn" to="/auth">Create your account</Link>
        </div>
      )}
    </div>
  );
}
