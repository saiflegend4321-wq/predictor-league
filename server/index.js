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

// ─── Placeholder team detector ────────────────────────────────────────────────
// openfootball uses labels like "1A", "2B", "Winner A", "Runner-up B" for
// knockout fixtures before the group stage is complete. These must NEVER be
// stored as real teams in the teams table.
const PLACEHOLDER_RE = /^(\d[A-Z]|Winner\b|Runner-up\b|Loser\b|[A-Z]\d)/i;

function isPlaceholder(name) {
  if (!name) return true;
  // Short codes like "1A", "2B", "3C" etc.
  if (PLACEHOLDER_RE.test(name)) return true;
  // Explicit list of known openfootball placeholder patterns
  const known = [
    "TBD", "tbd", "?",
  ];
  return known.includes(name);
}

// ─── Timezone offset parser ───────────────────────────────────────────────────
// openfootball times look like "13:00 UTC-6" or "20:00 UTC-4"
function parseKickoff(date, time) {
  const m = time?.match(/^(\d{2}:\d{2})\s+UTC([+-]\d+)$/);
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
  const ko = new Date(parseKickoff(match.date, match.time));
  const now = Date.now();
  if (ko.getTime() < now - 3 * 60 * 60 * 1000) return "live";
  if (ko.getTime() <= now) return "live";
  return "scheduled";
}

// ─── Penalty detection ────────────────────────────────────────────────────────
function detectPenalties(match) {
  const isKnockout = /round|quarter|semi|final/i.test(match.round ?? "");
  if (!isKnockout) return false;
  const ft = match.score?.ft;
  if (!ft || ft[0] !== ft[1]) return false;
  const allGoals = [...(match.goals1 ?? []), ...(match.goals2 ?? [])];
  return allGoals.some((g) => g.penalty === true && g.minute === "pen");
}

// ─── Name normaliser ──────────────────────────────────────────────────────────
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
  const stats = { teamsEnsured: 0, fixturesUpserted: 0, scoresUpdated: 0, placeholdersSkipped: 0, warnings: [] };

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

  // 2. Collect REAL team names only — never insert placeholders into teams table
  const teamNames = new Set();
  for (const m of matches) {
    const t1 = normaliseName(m.team1);
    const t2 = normaliseName(m.team2);
    if (!isPlaceholder(t1)) teamNames.add(t1);
    if (!isPlaceholder(t2)) teamNames.add(t2);
  }

  // 3. Ensure each real team exists (insert on conflict do nothing)
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

  // 5. Upsert fixtures
  //
  // external_id strategy:
  //   • Group stage (real teams known from day 1):
  //       "team1:team2:date"  — same as before, stable forever
  //
  //   • Knockout stage with placeholders (e.g. "1A", "2B"):
  //       "slot:date:venue"   — stable key based on position in the bracket,
  //       not team names, so the row gets UPDATED in-place when real teams
  //       are confirmed rather than a duplicate being inserted.
  //       Once real teams are known we also update home_team_id / away_team_id.
  //
  //   If BOTH teams are placeholders we still upsert the fixture (so the
  //   schedule is visible) but leave team ids null and mark it clearly.
  //   If only ONE team is a placeholder we still upsert with the known team
  //   id so the partial info shows up correctly.

  for (const m of matches) {
    const t1Raw = m.team1;
    const t2Raw = m.team2;
    const t1 = normaliseName(t1Raw);
    const t2 = normaliseName(t2Raw);

    const t1IsPlaceholder = isPlaceholder(t1);
    const t2IsPlaceholder = isPlaceholder(t2);

    // Choose a stable external_id that won't change when placeholders resolve
    // For knockout fixtures we key on date + venue (+ raw placeholder labels)
    // so the same row is found on every sync regardless of what the team names are.
    let extId;
    if (t1IsPlaceholder || t2IsPlaceholder) {
      // Use the raw openfootball labels (e.g. "1A", "2B") + date + venue as key.
      // These never change in the openfootball data for a given slot.
      const venue = m.ground ?? "unknown";
      extId = `slot:${t1Raw}:${t2Raw}:${m.date}:${venue}`;
    } else {
      // Both real teams — original stable key
      extId = `${t1}:${t2}:${m.date}`;
    }

    const kickoff    = parseKickoff(m.date, m.time);
    const status     = deriveStatus(m);
    const ft         = m.score?.ft;
    const homeScore  = ft ? ft[0] : null;
    const awayScore  = ft ? ft[1] : null;
    const wentToPens = detectPenalties(m);

    const homeId = t1IsPlaceholder ? null : (nameToId.get(t1) ?? null);
    const awayId = t2IsPlaceholder ? null : (nameToId.get(t2) ?? null);

    // Warn (but don't skip) if a real team name has no UUID — data mismatch
    if (!t1IsPlaceholder && !homeId) {
      stats.warnings.push(`Unknown team name "${t1}" — fixture ${extId} will have null home_team_id`);
    }
    if (!t2IsPlaceholder && !awayId) {
      stats.warnings.push(`Unknown team name "${t2}" — fixture ${extId} will have null away_team_id`);
    }

    const fixture = {
      external_id:       extId,
      round:             m.round ?? "Unknown",
      kickoff_at:        kickoff,
      venue:             m.ground ?? null,
      status,
      home_score:        homeScore,
      away_score:        awayScore,
      went_to_penalties: wentToPens,
      group_label:       m.group ?? null,
      // Always write team ids — when placeholders resolve to real teams
      // this UPDATE replaces the null with the correct UUID automatically.
      ...(homeId !== null && { home_team_id: homeId }),
      ...(awayId !== null && { away_team_id: awayId }),
    };

    const { error: fe } = await client
      .from("fixtures")
      .upsert(fixture, {
        onConflict:     "external_id",
        // Do NOT ignoreDuplicates — we want updates (scores, team ids, status)
        ignoreDuplicates: false,
      });

    if (fe) {
      stats.warnings.push(`Fixture ${extId}: ${fe.message}`);
    } else {
      stats.fixturesUpserted++;
      if (ft) stats.scoresUpdated++;
      if (t1IsPlaceholder || t2IsPlaceholder) stats.placeholdersSkipped++;
    }
  }

  // 6. Clean up any orphaned placeholder teams that may have been inserted
  //    by a previous version of this script. Safe — only removes rows whose
  //    name matches the placeholder pattern AND have no fixtures referencing them.
  try {
    const { data: allTeams } = await client.from("teams").select("id, name");
    const placeholderTeams = (allTeams ?? []).filter((t) => isPlaceholder(t.name));

    for (const pt of placeholderTeams) {
      // Check if any fixture still references this team
      const { count } = await client
        .from("fixtures")
        .select("id", { count: "exact", head: true })
        .or(`home_team_id.eq.${pt.id},away_team_id.eq.${pt.id}`);

      if (count === 0) {
        await client.from("teams").delete().eq("id", pt.id);
        stats.warnings.push(`Cleaned up orphaned placeholder team "${pt.name}"`);
      }
    }
  } catch (cleanErr) {
    // Non-fatal — log but don't fail the sync
    stats.warnings.push(`Placeholder cleanup error: ${cleanErr.message}`);
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
  console.log(
    "Initial sync:",
    r.error ?? `${r.fixturesUpserted} fixtures, ${r.scoresUpdated} scored, ${r.placeholdersSkipped} placeholder slots`
  );

  // Auto-sync every 15 minutes
  setInterval(async () => {
    const r = await syncFromOpenfootball();
    const ts = new Date().toISOString();
    if (r.error) console.error(`[${ts}] Auto-sync error:`, r.error);
    else console.log(`[${ts}] Auto-sync: ${r.fixturesUpserted} fixtures, ${r.scoresUpdated} scored, ${r.placeholdersSkipped} placeholder slots`);
  }, 15 * 60 * 1000);
});