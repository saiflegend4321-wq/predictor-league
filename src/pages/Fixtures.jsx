import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import FixtureCard from "../components/FixtureCard";

const TABS = [
  { id: "live",     label: "🔴 Live"      },
  { id: "upcoming", label: "⏰ Upcoming"   },
  { id: "finished", label: "✅ Finished"   },
  { id: "all",      label: "All"           },
];

export default function Fixtures() {
  const { user } = useAuth();

  const [fixtures,    setFixtures]    = useState([]);
  const [favourites,  setFavourites]  = useState(null);
  const [predictions, setPredictions] = useState({}); // keyed by fixture_id
  const [tab,         setTab]         = useState("upcoming");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [lastSync,    setLastSync]    = useState(null);

  // ── Load all data in parallel ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setError("");
    try {
      const [
        { data: fx,    error: fxErr  },
        { data: fav                  },
        { data: preds, error: prErr  },
      ] = await Promise.all([
        supabase
          .from("fixtures")
          .select(`
            id, round, group_label, kickoff_at, venue,
            status, home_score, away_score, went_to_penalties,
            home_team:home_team_id ( id, name, fifa_code, flag_emoji ),
            away_team:away_team_id ( id, name, fifa_code, flag_emoji )
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
      if (prErr) throw prErr;

      // Supabase returns null for foreign-key joins when the referenced row
      // doesn't exist (e.g. knockout fixtures with unresolved qualifiers).
      // Normalise those to a consistent shape so FixtureCard never crashes.
      const normalised = (fx ?? []).map((f) => ({
        ...f,
        home_team: f.home_team ?? null,
        away_team: f.away_team ?? null,
      }));

      setFixtures(normalised);
      setFavourites(fav ?? null);

      // Index predictions by fixture_id for O(1) lookup per card
      const map = {};
      for (const p of preds ?? []) map[p.fixture_id] = p;
      setPredictions(map);

      setLastSync(new Date());
    } catch (err) {
      setError(err.message || "Failed to load fixtures.");
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  // ── Supabase Realtime subscriptions ──────────────────────────────────────
  useEffect(() => {
    load();

    // Live fixture score / status changes push instantly to every browser
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
                    kickoff_at:        payload.new.kickoff_at,
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
        () => load() // new fixture added — reload everything to get joined teams
      )
      .subscribe();

    // Own prediction changes (points awarded after a result lands, etc.)
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
          setLastSync(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(fixtureSub);
      supabase.removeChannel(predSub);
    };
  }, [load, user.id]);

  // ── Submit / update a prediction ─────────────────────────────────────────
  // FixtureCard calls this with (fixtureId, outcome) for a button pick,
  // or (fixtureId, outcome, homeGoals, awayGoals) for a score prediction.
  async function handlePredict(fixtureId, outcome, predictedHomeScore, predictedAwayScore) {
    const upsertPayload = {
      user_id:          user.id,
      fixture_id:       fixtureId,
      predicted_outcome: outcome,
    };

    // Include score fields only when provided (the DB columns may not exist
    // yet if you haven't run the migration — they're optional)
    if (predictedHomeScore !== undefined && predictedHomeScore !== null) {
      upsertPayload.predicted_home_score = predictedHomeScore;
    }
    if (predictedAwayScore !== undefined && predictedAwayScore !== null) {
      upsertPayload.predicted_away_score = predictedAwayScore;
    }

    const { data, error: upsertErr } = await supabase
      .from("predictions")
      .upsert(upsertPayload, { onConflict: "user_id,fixture_id" })
      .select()
      .single();

    if (upsertErr) throw upsertErr;

    // Optimistically update local state so the UI responds instantly
    setPredictions((prev) => ({ ...prev, [fixtureId]: data }));
  }

  // ── Tab counts ────────────────────────────────────────────────────────────
  const liveCount     = fixtures.filter((f) => f.status === "live").length;
  const upcomingCount = fixtures.filter((f) => f.status === "scheduled").length;
  const finishedCount = fixtures.filter((f) => f.status === "finished").length;

  const tabCount = { live: liveCount, upcoming: upcomingCount, finished: finishedCount };

  // ── Filter + group ────────────────────────────────────────────────────────
  const filtered = fixtures.filter((f) => {
    if (tab === "live")     return f.status === "live";
    if (tab === "upcoming") return f.status === "scheduled";
    if (tab === "finished") return f.status === "finished";
    return true; // "all"
  });

  // Group by group_label + round key for visual section headers
  const grouped = {};
  for (const f of filtered) {
    const key = f.group_label
      ? `${f.group_label} — ${f.round}`
      : (f.round ?? "Other");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">

      {/* ── Page header ── */}
      <div className="flex-between page-header">
        <div>
          <h1>Fixtures</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>
            Predict before kickoff · Locks automatically at kickoff ·
            Live scores update in real time
          </p>
        </div>
        {lastSync && (
          <div className="muted" style={{ fontSize: "0.75rem", textAlign: "right" }}>
            Last updated<br />
            {lastSync.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* ── No favourites warning ── */}
      {!favourites && (
        <div className="info-banner" style={{ marginBottom: 16 }}>
          ⭐ You haven't picked your 2 favourite teams yet.{" "}
          <a href="/my-team" style={{ fontWeight: 600 }}>Pick them now</a> — when your
          favourite plays, the prediction locks to support them and earns extra points.
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 16 }} role="alert">
          {error}
          <button
            onClick={load}
            style={{
              marginLeft: 12, background: "none", border: "none",
              color: "inherit", textDecoration: "underline", cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}

            {/* Live badge — pulses red */}
            {t.id === "live" && liveCount > 0 && (
              <span style={{
                marginLeft: 6,
                background: "var(--red)",
                color: "#fff",
                borderRadius: "999px",
                fontSize: "0.65rem",
                padding: "1px 6px",
                animation: "pulse 1s ease-in-out infinite",
              }}>
                {liveCount}
              </span>
            )}

            {/* Count badges for other tabs */}
            {t.id !== "live" && t.id !== "all" && tabCount[t.id] > 0 && (
              <span style={{
                marginLeft: 6,
                background: "rgba(255,255,255,0.12)",
                color: "var(--text-dim)",
                borderRadius: "999px",
                fontSize: "0.65rem",
                padding: "1px 6px",
              }}>
                {tabCount[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Loading ── */}
      {loading ? (
        <div className="muted center" style={{ padding: 48, fontSize: "0.95rem" }}>
          Loading fixtures…
        </div>

      /* ── Empty state ── */
      ) : filtered.length === 0 ? (
        <div className="card center muted" style={{ padding: 48 }}>
          {tab === "live"
            ? "No matches are live right now. Check back at kickoff time."
            : tab === "upcoming"
            ? "No upcoming fixtures scheduled yet. Admin will add them soon."
            : tab === "finished"
            ? "No finished matches yet — results will appear here after kickoff."
            : "No fixtures found."}
        </div>

      /* ── Fixture groups ── */
      ) : (
        Object.entries(grouped).map(([groupKey, groupFixtures]) => (
          <div key={groupKey} style={{ marginBottom: 36 }}>

            {/* Group heading */}
            <h3 style={{
              color: "var(--gold)",
              marginBottom: 14,
              fontSize: "0.95rem",
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}>
              {groupKey}
            </h3>

            <div className="grid grid-3">
              {groupFixtures.map((f) => (
                <FixtureCard
                  key={f.id}
                  fixture={f}
                  favourites={favourites}
                  prediction={predictions[f.id] ?? null}
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