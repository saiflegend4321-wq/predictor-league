import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import FixtureCard from "../components/FixtureCard";

const TABS = [
  { id: "live",     label: "🔴 Live" },
  { id: "upcoming", label: "⏰ Upcoming" },
  { id: "finished", label: "✅ Finished" },
  { id: "all",      label: "All" },
];

export default function Fixtures() {
  const { user } = useAuth();
  const [fixtures, setFixtures]     = useState([]);
  const [favourites, setFavourites] = useState(null);
  const [predictions, setPredictions] = useState({});
  const [tab, setTab]   = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [lastSync, setLastSync] = useState(null);

  // ── Load everything ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [{ data: fx, error: fxErr }, { data: fav }, { data: preds }] =
        await Promise.all([
          supabase
            .from("fixtures")
            .select(`
              id, round, group_label, kickoff_at, venue,
              status, home_score, away_score, went_to_penalties,
              home_team:home_team_id(id, name, fifa_code, flag_emoji),
              away_team:away_team_id(id, name, fifa_code, flag_emoji)
            `)
            .order("kickoff_at", { ascending: true }),
          supabase
            .from("user_favourite_teams")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("predictions")
            .select("*")
            .eq("user_id", user.id),
        ]);

      if (fxErr) throw fxErr;
      setFixtures(fx ?? []);
      setFavourites(fav ?? null);
      const map = {};
      for (const p of preds ?? []) map[p.fixture_id] = p;
      setPredictions(map);
      setLastSync(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  // ── Supabase Realtime: fixture score changes ─────────────────────────────
  useEffect(() => {
    load();

    // Subscribe to fixture changes (scores, status) — updates all browsers instantly
    const fixtureSub = supabase
      .channel("fixtures-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fixtures" },
        (payload) => {
          setFixtures((prev) =>
            prev.map((f) =>
              f.id === payload.new.id
                ? {
                    ...f,
                    status:            payload.new.status,
                    home_score:        payload.new.home_score,
                    away_score:        payload.new.away_score,
                    went_to_penalties: payload.new.went_to_penalties,
                    group_label:       payload.new.group_label,
                  }
                : f
            )
          );
          setLastSync(new Date());
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fixtures" },
        () => load() // new fixture added → reload everything
      )
      .subscribe();

    // Subscribe to own prediction changes
    const predSub = supabase
      .channel("predictions-mine")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "predictions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setPredictions((prev) => {
              const next = { ...prev };
              delete next[payload.old.fixture_id];
              return next;
            });
          } else {
            setPredictions((prev) => ({
              ...prev,
              [payload.new.fixture_id]: payload.new,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(fixtureSub);
      supabase.removeChannel(predSub);
    };
  }, [load, user.id]);

  // ── Predict ──────────────────────────────────────────────────────────────
  async function handlePredict(fixtureId, outcome) {
    const { data, error: upsertErr } = await supabase
      .from("predictions")
      .upsert(
        { user_id: user.id, fixture_id: fixtureId, predicted_outcome: outcome },
        { onConflict: "user_id,fixture_id" }
      )
      .select()
      .single();
    if (upsertErr) throw upsertErr;
    setPredictions((prev) => ({ ...prev, [fixtureId]: data }));
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  const liveCount = fixtures.filter((f) => f.status === "live").length;

  const filtered = fixtures.filter((f) => {
    if (tab === "live")     return f.status === "live";
    if (tab === "upcoming") return f.status === "scheduled";
    if (tab === "finished") return f.status === "finished";
    return true;
  });

  // Group by round/matchday for the upcoming + all tabs
  const grouped = {};
  for (const f of filtered) {
    const key = f.group_label
      ? `${f.group_label} — ${f.round}`
      : (f.round ?? "Other");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  }

  return (
    <div className="page">
      <div className="flex-between page-header">
        <div>
          <h1>Fixtures</h1>
          <p>Predict before kickoff · Locks automatically · Live scores update instantly</p>
        </div>
        {lastSync && (
          <div className="muted" style={{ fontSize: "0.75rem", textAlign: "right" }}>
            Last updated<br />
            {lastSync.toLocaleTimeString()}
          </div>
        )}
      </div>

      {!favourites && (
        <div className="info-banner">
          ⭐ You haven't picked your 2 favourite teams yet.{" "}
          <a href="/my-team">Pick them now</a> — when your favourite plays, the
          prediction locks to them automatically and earns more points.
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "live" && liveCount > 0 && (
              <span style={{
                marginLeft: 6, background: "var(--red)", color: "#fff",
                borderRadius: "999px", fontSize: "0.65rem", padding: "1px 6px",
              }}>
                {liveCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="muted center" style={{ padding: 40 }}>Loading fixtures…</div>
      ) : filtered.length === 0 ? (
        <div className="card center muted" style={{ padding: 40 }}>
          {tab === "live"
            ? "No live matches right now. Check back at kickoff."
            : tab === "upcoming"
            ? "No upcoming fixtures yet. Admin will add them shortly."
            : "No finished matches yet."}
        </div>
      ) : (
        Object.entries(grouped).map(([groupKey, groupFixtures]) => (
          <div key={groupKey} style={{ marginBottom: 32 }}>
            <h3 style={{ color: "var(--gold)", marginBottom: 12, fontSize: "1rem" }}>
              {groupKey}
            </h3>
            <div className="grid grid-3">
              {groupFixtures.map((f) => (
                <FixtureCard
                  key={f.id}
                  fixture={f}
                  favourites={favourites}
                  prediction={predictions[f.id]}
                  onPredict={handlePredict}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
