# ⚽ FIFA World Cup 2026 — Fantasy Predictor

A full-stack fantasy prediction league for the FIFA World Cup 2026.
Pick two favourite teams, predict every match, earn points based on
results and goals, and compete on a live-updating leaderboard.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (SPA) |
| Backend / DB | Supabase (Postgres + Auth + Realtime) |
| Sync server | Node.js / Express (sidecar) |
| Live data | openfootball/worldcup.json (GitHub raw, free, no key) |
| Realtime | Supabase Realtime websocket subscriptions |
| Hosting (suggested) | Vercel (frontend) + Render (sync server) |

---

## Setup — 5 steps

### Step 1 · Create a Supabase project

1. Sign up at https://supabase.com (free tier is enough)
2. **New project** — choose a name and strong password
3. Once ready, go to **Settings → API** and copy:
   - **Project URL** → use as `VITE_SUPABASE_URL` and `SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** (keep secret!) → `SUPABASE_SERVICE_ROLE_KEY`

### Step 2 · Run the database migrations

Open **Supabase → SQL Editor**, paste and run each file **in order**:

```
supabase/migrations/0001_schema.sql        tables, triggers, auto-profile, auto-admin
supabase/migrations/0002_scoring.sql       score_fixture() + auto-rescore trigger
supabase/migrations/0003_prediction_rules.sql  kickoff lock + favourite-team guard
supabase/migrations/0004_rls.sql           Row Level Security policies
supabase/migrations/0005_leaderboard.sql   leaderboard view + get_leaderboard() RPC
supabase/migrations/0006_seed_teams.sql    48 World Cup 2026 nations with flag emojis
supabase/migrations/0007_realtime.sql      Supabase Realtime + group_label column
```

Paste each file's content, click **Run**. Expect "Success. No rows returned" for each.

### Step 3 · Enable Google Sign-In (optional)

1. Supabase dashboard → **Authentication → Providers → Google → Enable**
2. In Google Cloud Console create an OAuth 2.0 Client ID:
   - Authorised redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
3. Paste Client ID + Secret back into Supabase

### Step 4 · Configure environment variables

```bash
cp .env.example .env
```
Edit `.env` and fill in:
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SERVER_PORT=5000
```

### Step 5 · Run locally

```bash
npm install

# Terminal 1 — React frontend (http://localhost:5173)
npm run dev

# Terminal 2 — Sync server (http://localhost:5000, auto-polls openfootball every 15 min)
npm run server
```

Then open http://localhost:5173.

---

## Admin access

Sign up with **saiflegend4321@gmail.com** — the `on_auth_user_created` trigger
automatically grants the `admin` role. The `/admin` route is then visible in
the navbar.

---

## Data source: openfootball/worldcup.json

```
https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
```

- **Free, no API key, no rate limits, public domain**
- Maintained by the open-source football data community
- Contains all 104 matches with kickoff times, venues, scores (once played),
  goal scorers, and penalty flags
- The sync server polls this URL every 15 minutes automatically
- Use **Admin → Sync Now** for an on-demand refresh

The sync server maps openfootball team names to our seeded 48-nation table
(via a `NAME_MAP` dict for the few that differ), upserts fixtures using a
stable `external_id` of `team1:team2:date`, and detects probable penalty
shootouts by checking for a drawn score in a knockout round.

---

## Scoring rules

All scoring runs in PostgreSQL (`score_fixture()` in migration 0002) and
fires automatically via a trigger whenever a fixture's score or status changes.

| Situation | Base pts | Goal bonus |
|---|---|---|
| Your **Favourite #1** team wins | **6** | goals scored by your team |
| Your **Favourite #2** team wins | **3** | goals scored by your team |
| **Free pick** wins (neither fav playing) | **6** | goals scored by chosen team |
| You picked a team to win → **match drawn** | **1** | goals scored by your team |
| You predicted **draw** → match **was drawn** | **2** | total goals in the match |
| Wrong prediction | **0** | — |

**Penalty shootout rule:** only the regulation/extra-time score is used.
Shootout goals are never counted. The admin enters the 90+ET score directly;
`went_to_penalties` is a display flag only.

**Kickoff lock:** predictions lock the instant `kickoff_at <= now()`, enforced
in the `validate_prediction` database trigger — not just in the UI.

**Favourite-team guard:** if your favourite is playing, you must back them (or
predict a draw). You cannot predict the opposing team to win. Enforced in the
DB trigger and visually in the frontend (opposing buttons disabled).

---

## Realtime

Supabase Realtime websocket subscriptions are open on:

- `fixtures` — score and status changes push to all browsers instantly
  (the Fixtures page updates without a page refresh when an admin enters a result)
- `predictions` — your own prediction changes reflect immediately
- `profiles` — leaderboard refreshes when predictions are scored

Enabled by migration 0007 which adds these tables to the `supabase_realtime`
publication.

---

## Pages

| Path | Auth | Description |
|---|---|---|
| `/` | — | Hero, live stats ticker, scoring summary |
| `/rules` | — | Full scoring rules |
| `/auth` | — | Email/password + Google sign-in / register |
| `/fixtures` | ✅ | Live, upcoming, finished matches — predict each |
| `/my-team` | ✅ | Pick & lock 2 favourite teams, view your points |
| `/leaderboard` | — | Global standings (live-updating) |
| `/admin` | admin | Add/edit fixtures, enter results, trigger sync |

---

## Deployment

### Frontend → Vercel

1. Push repo to GitHub
2. Import in Vercel; framework = Vite; build = `npm run build`; output = `dist`
3. Set environment variables (all `VITE_*` ones only)
4. Deploy

### Sync server → Render

1. New Web Service; root = `/`; start command = `node server/index.js`
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SERVER_PORT=10000`
3. Deploy
4. In `vite.config.js` change the proxy target to the Render URL, or set
   `VITE_API_URL` and use that in the Admin page fetch call

---

## Project structure

```
fifa-fantasy-predictor/
├── supabase/migrations/          7 SQL files — run in order in Supabase SQL Editor
│   ├── 0001_schema.sql
│   ├── 0002_scoring.sql
│   ├── 0003_prediction_rules.sql
│   ├── 0004_rls.sql
│   ├── 0005_leaderboard.sql
│   ├── 0006_seed_teams.sql
│   └── 0007_realtime.sql
│
├── server/
│   └── index.js                  Express sync server — openfootball → Supabase
│
├── src/
│   ├── lib/
│   │   ├── supabaseClient.js     Supabase singleton
│   │   └── scoringRules.js       Rules constants (display only; DB is source of truth)
│   ├── context/
│   │   └── AuthContext.jsx       Session, login, register, Google OAuth, role check
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── FixtureCard.jsx       Match card with countdown, live glow, prediction pick
│   ├── pages/
│   │   ├── Home.jsx              Hero + live stats
│   │   ├── Rules.jsx
│   │   ├── Auth.jsx
│   │   ├── Fixtures.jsx          Realtime subscriptions, grouped by round
│   │   ├── MyTeam.jsx            Favourite team picker + points summary
│   │   ├── Leaderboard.jsx       Live leaderboard with medals
│   │   └── Admin.jsx             Sync log, fixture management, result entry
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css                 Dark World Cup theme, live-glow animations
│
├── .env.example
├── index.html
├── package.json
├── vite.config.js
└── README.md
```
