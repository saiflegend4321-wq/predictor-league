/**
 * FIFA Fantasy Predictor — Sync Server
 * ─────────────────────────────────────
 * Source:  https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
 *          100% free, no API key, public domain, updates as games finish.
 *
 * Routes:
 *   POST /api/public/hooks/sync-fixtures  — upserts teams + fixtures from openfootball
 *   GET  /api/health                       — health check
 *
 * Auto-sync: runs every 15 min via setInterval so the DB stays fresh even
 * without a cron service.  Call POST /api/public/hooks/sync-fixtures manually
 * from the Admin page for an on-demand refresh.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

const OPENFOOTBALL_URL =
  process.env.OPENFOOTBALL_URL ||
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function db() {
  return createClient(SUPABASE_URL, SUPABASE_SVC_KEY, { auth: { persistSession: false } });
}

// ─── Timezone offset parser ───────────────────────────────────────────────────
// openfootball times look like "13:00 UTC-6" or "20:00 UTC-4"
function parseKickoff(date, time) {
  // time = "13:00 UTC-6"
  const m = time.match(/^(\d{2}:\d{2})\s+UTC([+-]\d+)$/);
  if (!m) return new Date(`${date}T00:00:00Z`).toISOString();
  const [, hhmm, offset] = m;
  const offsetHours = parseInt(offset, 10);
  const [hh, mm] = hhmm.split(":").map(Number);
  const utcMs = Date.UTC(
    ...date.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)),
    hh - offsetHours,
    mm
  );
  return new Date(utcMs).toISOString();
}

// ─── Detect status ────────────────────────────────────────────────────────────
function deriveStatus(match) {
  const hasScore = match.score && match.score.ft;
  if (hasScore) return "finished";
  // If kickoff was more than 3h ago but no score yet, treat as live (data lag)
  const ko = new Date(parseKickoff(match.date, match.time));
  const now = Date.now();
  if (ko.getTime() < now - 3 * 60 * 60 * 1000) return "live";
  if (ko.getTime() <= now) return "live";
  return "scheduled";
}

// ─── Penalty detection ────────────────────────────────────────────────────────
// openfootball marks penalty/shootout goals with "penalty: true" in the goals
// array. For knockout rounds a drawn FT score where the winning team has extra
// goals beyond FT is a pen shootout — but openfootball only records 90+ET score.
// We flag: knockout + score drawn + goals arrays contain penalty:true entries.
function detectPenalties(match) {
  const isKnockout = /round|quarter|semi|final/i.test(match.round ?? "");
  if (!isKnockout) return false;
  const ft = match.score?.ft;
  if (!ft || ft[0] !== ft[1]) return false; // not a draw after 90+ET
  // If there are penalty:true entries in goals it was a shootout
  const allGoals = [...(match.goals1 ?? []), ...(match.goals2 ?? [])];
  return allGoals.some((g) => g.penalty === true && g.minute === "pen");
}

// ─── Name normaliser ──────────────────────────────────────────────────────────
// openfootball uses slightly different names for a few teams vs our seed data.
const NAME_MAP = {
  "Bosnia & Herzegovina": "Bosnia And Herzegovina",
  "DR Congo":             "Congo DR",
  "Cape Verde":           "Cabo Verde",
  "Ivory Coast":          "Côte D'Ivoire",
  "Turkey":               "Türkiye",
  "Czech Republic":       "Czechia",
  "South Korea":          "Korea Republic",
  "IR Iran":              "IR Iran",
  "Iran":                 "IR Iran",
  "USA":                  "USA",
};

function normaliseName(name) {
  return NAME_MAP[name] ?? name;
}

// ─── Core sync function ───────────────────────────────────────────────────────
async function syncFromOpenfootball() {
  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) {
    return { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" };
  }
  const client = db();
  const stats = { teamsEnsured: 0, fixturesUpserted: 0, scoresUpdated: 0, warnings: [] };

  // 1. Fetch from GitHub
  let data;
  try {
    const res = await fetch(OPENFOOTBALL_URL);
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    data = await res.json();
  } catch (err) {
    return { error: `Fetch failed: ${err.message}` };
  }

  const matches = data.matches ?? [];
  if (!matches.length) return { error: "Empty matches array from openfootball" };

  // 2. Collect unique team names
  const teamNames = new Set();
  for (const m of matches) {
    teamNames.add(normaliseName(m.team1));
    teamNames.add(normaliseName(m.team2));
  }

  // 3. Ensure each team exists (insert on conflict do nothing)
  for (const name of teamNames) {
    const { error: te } = await client
      .from("teams")
      .upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
    if (te) stats.warnings.push(`Team "${name}": ${te.message}`);
    else stats.teamsEnsured++;
  }

  // 4. Build name → UUID lookup
  const { data: teamsInDb, error: teamFetchErr } = await client
    .from("teams")
    .select("id, name");
  if (teamFetchErr) return { error: `Team lookup failed: ${teamFetchErr.message}` };

  const nameToId = new Map(teamsInDb.map((t) => [t.name, t.id]));

  // 5. Upsert fixtures using a stable external_id = "team1_name:team2_name:date"
  for (const m of matches) {
    const t1 = normaliseName(m.team1);
    const t2 = normaliseName(m.team2);
    const homeId = nameToId.get(t1);
    const awayId = nameToId.get(t2);

    if (!homeId || !awayId) {
      stats.warnings.push(`No UUID for "${t1}" or "${t2}" — skipping`);
      continue;
    }

    const extId = `${t1}:${t2}:${m.date}`;
    const kickoff = parseKickoff(m.date, m.time);
    const status = deriveStatus(m);
    const ft = m.score?.ft;
    const homeScore = ft ? ft[0] : null;
    const awayScore = ft ? ft[1] : null;
    const wentToPens = detectPenalties(m);

    const fixture = {
      external_id:       extId,
      round:             m.round ?? "Unknown",
      home_team_id:      homeId,
      away_team_id:      awayId,
      kickoff_at:        kickoff,
      venue:             m.ground ?? null,
      status,
      home_score:        homeScore,
      away_score:        awayScore,
      went_to_penalties: wentToPens,
      group_label:       m.group ?? null,
    };

    const { error: fe } = await client
      .from("fixtures")
      .upsert(fixture, { onConflict: "external_id" });

    if (fe) stats.warnings.push(`Fixture ${extId}: ${fe.message}`);
    else {
      stats.fixturesUpserted++;
      if (ft) stats.scoresUpdated++;
    }
  }

  return { ...stats, totalMatches: matches.length };
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.post("/api/public/hooks/sync-fixtures", async (_req, res) => {
  const result = await syncFromOpenfootball();
  if (result.error) return res.status(502).json(result);
  return res.json({ message: "Sync complete", ...result });
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ─── Server start + auto-poll ─────────────────────────────────────────────────
const PORT = process.env.SERVER_PORT ?? 5000;
app.listen(PORT, async () => {
  console.log(`Sync server → http://localhost:${PORT}`);
  console.log("Source: openfootball/worldcup.json (GitHub raw, no API key)");

  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) {
    console.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — auto-sync disabled");
    return;
  }

  // Initial sync on startup
  console.log("Running initial sync…");
  const r = await syncFromOpenfootball();
  console.log("Initial sync:", r.error ?? `${r.fixturesUpserted} fixtures, ${r.scoresUpdated} scored`);

  // Auto-sync every 15 minutes
  setInterval(async () => {
    const r = await syncFromOpenfootball();
    const ts = new Date().toISOString();
    if (r.error) console.error(`[${ts}] Auto-sync error:`, r.error);
    else console.log(`[${ts}] Auto-sync: ${r.fixturesUpserted} fixtures, ${r.scoresUpdated} scored`);
  }, 15 * 60 * 1000);
});
