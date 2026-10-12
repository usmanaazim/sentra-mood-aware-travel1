# SENTRA — An AI-Driven Mood-Aware Travel Place Recommendation System

SENTRA helps you decide **where to go based on how you feel**. Traditional navigation apps route you to a
destination you already know; SENTRA starts one step earlier. Tell it your mood, how much time you have,
what you can spend and roughly where you are, and it ranks real nearby places from OpenStreetMap with an
explanation for every suggestion.

> **Honest labelling:** SENTRA ships **no trained machine-learning model** and no paid AI service. The
> "AI" in the subtitle refers to the intelligent, rule-based recommendation pipeline described below.
> It is transparent, auditable JavaScript — and this README says exactly how it scores things.

---

## 1. Project objective

| | |
|---|---|
| **Problem** | Mapping apps answer "how do I get to X?". They do not answer "given how I feel right now, where should I go?" |
| **Solution** | A mood-aware discovery interface that retrieves nearby OpenStreetMap places and scores their suitability against mood, distance and preferences. |
| **Example** | *"I feel stressed, I have 2 hours and ₹300, I'm in Bengaluru"* → SENTRA looks for parks, gardens, nature reserves and quiet cafes within your radius, then explains each ranking. |
| **Non-goals** | No diagnosis of emotions, no mental-health claims, no fabricated prices/ratings/visit durations, no turn-by-turn navigation, no paid APIs. |

---

## 2. Architecture

```
Browser (React SPA)
   │  fetch /api/*  (session cookie + CSRF header)
   ▼
Express API (Node.js)
   ├── auth ────────── bcryptjs hashes, express-session + SQLite session store
   ├── places ──────── Overpass HTTP client (timeout, cache, coalescing, normaliser)
   ├── recommendations ─ transparent scoring engine (plain JS)
   ├── feedback ────── SQLite, scoped per user
   └── profile ─────── per-user preferences
   ▼
   SQLite (better-sqlite3)          public Overpass API ──> OpenStreetMap data
```

* **Frontend:** React 18, Vite, React Router, Leaflet + React Leaflet, one plain CSS stylesheet, lucide-react icons.
* **Backend:** Node.js 18+, Express 4, better-sqlite3, bcryptjs, express-session, helmet, express-rate-limit, cors, dotenv.
* **Data:** OpenStreetMap via the community-run public Overpass API. Map tiles are OpenStreetMap-based
  raster tiles from the FOSSGIS e.V. service (`tile.openstreetmap.de`) — see §13 for why the OSM
  Foundation's own tile host is not used.
* **Auth:** server-side sessions; the browser only holds an opaque, HTTP-only cookie.
* **No paid keys:** no Google Maps, Google Places, no paid maps, auth or AI providers.

### Directory layout

```
sentra/
├── .env.example              # placeholders only — copy to .env
├── .gitignore                # ignores .env, server/data/, dist/, node_modules/
├── package.json              # root scripts (dev, build, test)
├── scripts/
│   ├── dev.mjs               # runs API + web app together (zero deps)
│   └── smoke-test.sh         # end-to-end API smoke test
├── server/                   # Express API + SQLite
│   ├── server.js             # entry point (listens on PORT)
│   ├── app.js                # app factory: security, routes, static SPA
│   ├── config.js             # environment configuration + safe defaults
│   ├── db.js                 # schema initialisation (idempotent, never wipes)
│   ├── sessionStore.js       # SQLite-backed express-session store
│   ├── middleware.js         # auth guards, rate limits, CSRF, error handler
│   ├── mood.js               # moods, categories, keyword interpreter
│   ├── validate.js           # pure validation helpers
│   ├── overpass.js           # Overpass client + cache + normaliser
│   ├── recommend.js          # scoring engine (Haversine, weights, reasons)
│   ├── demoData.js           # 12 clearly fictional sample records
│   ├── routes/               # auth, places, recommendations, feedback, profile
│   └── test/                 # node:test suites (unit + full API)
└── client/                   # React SPA
    ├── index.html
    ├── vite.config.js        # dev server on 0.0.0.0 + /api proxy
    └── src/
        ├── main.jsx  App.jsx  styles.css
        ├── lib/              # api client, mood catalogue, geo, scoring mirror, demo data
        ├── state/store.jsx   # auth, toasts, review state
        ├── components/       # Layout, MoodSelector, PreferenceForm, LocationPicker,
        │                     # SentraMap, PlaceCard, RecommendationList, States, ErrorBoundary,
        │                     # DiscoveryWorkspace…
        └── pages/            # Landing, Login, Register, Discover, Dashboard, Profile, About, NotFound
```

---

## 3. Prerequisites

* **Node.js 18.18 or newer** (LTS recommended; developed on Node 20). Check with `node -v`.
* **npm 9+** (ships with Node).
* A modern browser. Geolocation needs **HTTPS or `localhost`** — the app detects insecure origins and
  offers manual coordinates instead.
* No Python, no Docker, no API keys required.
* *Build tools:* `better-sqlite3` is a native module. Prebuilt binaries exist for common platforms; if your
  platform has none, install a C toolchain (macOS: Xcode Command Line Tools; Windows: `npm i -g windows-build-tools`
  or Visual Studio Build Tools with "Desktop development with C++"; Debian/Ubuntu: `build-essential python3`).

---

## 4. Installation

```bash
# 1. from the project root
cd sentra

# 2. install both workspaces (server + client)
npm run install:all
#    equivalently:  npm --prefix server install && npm --prefix client install
```

### Windows notes

The commands above work in PowerShell, Command Prompt and Git Bash. If PowerShell blocks `npm.ps1`, either use
`npm.cmd run install:all` or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
`scripts/smoke-test.sh` needs Git Bash on Windows; the equivalent curl commands are in §9.

### macOS notes

If `npm install` fails while building `better-sqlite3`, run `xcode-select --install` and retry.

---

## 5. Environment configuration

Copy the template and edit it — **never commit a real `.env`** (it is already in `.gitignore`).

```bash
cp .env.example .env          # macOS / Linux / Git Bash
copy .env.example .env        # Windows CMD
Copy-Item .env.example .env   # Windows PowerShell
```

Generate a strong session secret and paste it into `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Exact browser origins allowed to call the API (comma/space separated). CORS **and** the CSRF origin check read this one list |
| `E2B_SANDBOX_ID` | *(set by the Arena/E2B platform)* | When present, the preview origins `https://<port>-<sandboxId>.e2b.app` are derived automatically for `PREVIEW_PORTS` — exact origins, never a wildcard |
| `PREVIEW_PORTS` | `5173,4000` | Ports to derive preview origins for (the web app and the API preview) |
| `PREVIEW_HOSTS` | *(empty)* | Extra preview hostnames for other platforms (`scheme optional`) |
| `FRONTEND_ORIGIN_PATTERNS` | *(empty)* | Opt-in glob patterns for origins that change per session, e.g. `https://5173-*.e2b.app` |
| `COOKIE_SAMESITE` | `lax` | `lax` \| `strict` \| `none`; `none` forces `Secure` (browsers reject insecure `SameSite=None`) |
| `SESSION_SECRET` | *(dev: random per boot)* | Signing secret. **Required in production** |
| `NODE_ENV` | `development` | `production` enables Secure cookies and strict errors |
| `DATABASE_PATH` | `server/data/sentra.db` | SQLite file (relative paths resolve against the project root) |
| `OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | Swap in another compliant Overpass endpoint here |
| `OVERPASS_TIMEOUT_MS` | `25000` | Upstream request timeout (the Overpass `[timeout:]` is derived from it) |
| `OVERPASS_USER_AGENT` | `SENTRA/1.0 (…)` | Required by Overpass usage policy — set a real contact |
| `PLACES_CACHE_TTL_MS` | `300000` | Nearby-search cache TTL (5 minutes) |
| `SESSION_TTL_SECONDS` | `604800` | Idle session lifetime (7 days) |
| `COOKIE_SECURE` / `TRUST_PROXY` | `false` / `0` | Set to `true`/`1` behind a TLS-terminating proxy |
| `FRAME_ANCESTORS` | `'self'` in production, `'self' https:` in development | Framing policy for the HTML shell only — the JSON API always sends `frame-ancestors 'none'` |

`.env.example` contains placeholders only — no credentials of any kind.

---

## 6. Running the application

### Option A — one command (recommended)

```bash
npm run dev
```

Starts the API (`http://localhost:4000`) **and** the web app (`http://localhost:5173`) with prefixed logs.
`Ctrl+C` stops both. (Internally this uses `node scripts/dev.mjs` — no extra dependency.)

### Option B — two terminals

```bash
# terminal 1 — backend
npm run dev:server          # nodemon-free live reload via node --watch
# or: npm run start         # plain start

# terminal 2 — frontend
npm run dev:client
```

### Local development URLs

| What | URL |
|---|---|
| Web application | <http://localhost:5173> |
| API root | <http://localhost:4000/api/health> |
| Nearby-place service status | <http://localhost:4000/api/places/health> |

The Vite dev server proxies `/api` to port 4000, so cookies stay first-party and no CORS is needed in development.

### Browser origins (CORS + the CSRF origin check)

Every state-changing request carries an `Origin` header that the API checks against **one** allow-list
(`config.isAllowedOrigin`, used by both the CORS layer and the CSRF middleware, so the two can never disagree):

* **Allowed:** the origins in `FRONTEND_ORIGIN`, the local dev hosts (`localhost`/`127.0.0.1` on 5173/4173)
  while `NODE_ENV=development`, plus `PREVIEW_HOSTS` and any `FRONTEND_ORIGIN_PATTERNS` match.
* **Preview hosts are derived, not guessed:** Arena/E2B serves each port at
  `https://<port>-<sandboxId>.e2b.app` and exports `E2B_SANDBOX_ID`, so the API builds those exact origins
  itself (`PREVIEW_PORTS=5173,4000` by default). There is no wildcard: only this sandbox's preview hosts on the
  ports the app actually serves are accepted. Ports/hosts can be overridden for other platforms.
* **Requests without an `Origin` header** (curl, the test suites, server-to-server, same-origin navigations)
  are always allowed — a cross-site page cannot suppress the header.
* **Refused origins get an explicit JSON error**, not a silent failure or a bare "no CORS headers" reply:

  ```json
  {"error":{"code":"forbidden_origin",
            "message":"This origin (https://evil.example.com) is not allowed to call the SENTRA API.",
            "details":{"origin":"…","hint":"Add the exact frontend origin to FRONTEND_ORIGIN…",
                       "allowedOrigins":["http://localhost:5173","https://5173-<sandbox>.e2b.app"]}}}
  ```

* Credentials stay enabled (`Access-Control-Allow-Credentials: true`) and the **exact** origin is echoed —
  `*` is never combined with credentials. Preflights (`OPTIONS`) are answered `204` for allowed origins and
  `403` (no CORS headers) for the rest.
* The SPA calls the API through **relative `/api` URLs**. A build-time `VITE_API_BASE_URL` pointing at
  `localhost` is ignored when the page is not itself on localhost (that would target the *visitor's*
  machine); the app falls back to same-origin requests and logs a console warning.

### Production-style single-origin run

```bash
npm run build        # builds client/dist
npm run start        # Express serves the API *and* the built SPA on port 4000
```

### Tests

```bash
npm test             # server: 40 tests (engine, validation, full API surface)
npm run test:ui      # UI: 82 assertions in a DOM harness against the running API
```

### End-to-end smoke test

```bash
npm run dev:server               # in one terminal
bash scripts/smoke-test.sh       # in another (Git Bash on Windows)
```

---

## 7. Registration, login and sessions

1. Open <http://localhost:5173/register>.
2. Enter full name, email, password (min 8 chars, at least two character classes) and confirm it.
3. You are signed in immediately and redirected to `/dashboard`.
4. Log in at `/login`; log out from the navbar or the **Account** tab on `/profile`.

What actually happens server-side:

* Password → `bcrypt.hash(password, 10)` in development, `12` in production. Plaintext is never stored or logged.
* `POST /api/auth/login` compares with `bcrypt.compare`; a **dummy hash** is compared when the email is
  unknown so response timing does not reveal whether an account exists, and the error message is generic.
* The session is **regenerated on login/registration** (session-fixation defence) and destroyed on logout.
* Cookie: `HttpOnly`, `SameSite=Lax` (configurable via `COOKIE_SAMESITE`), `Secure` when
  `NODE_ENV=production` or `COOKIE_SECURE=true`, 7-day max age, signed with `SESSION_SECRET`.
  `SameSite=None` is only for genuine cross-site deployments and automatically enables `Secure`.
* Sessions live in the SQLite `sessions` table — never in browser `localStorage`.
* Authentication endpoints are rate limited (default: 10 attempts / 15 min / IP).
* Validation is enforced on **both** client and server; duplicate emails are rejected on the normalised
  (lower-cased, trimmed) address.

**Demo access without an account:** `/discover` is public. Switch on **Demo mode** to explore the whole
interface, rank and map 12 clearly fictional sample places (bundled, ranked on-device). Demo mode never
contacts Overpass, so it also works when the backend or the public service is down. Live OpenStreetMap
searches require an account — which also protects the community service from anonymous bulk use.

---

## 8. Using the discovery interface

**Mood** — 8 moods (Happy, Calm, Stressed, Sad, Bored, Adventurous, Romantic, Curious) as emoji cards mapped to
place categories. Sentra makes **no medical or wellbeing claims**; these are recommendation heuristics.

**Free-text wish (optional)** — "somewhere quiet with trees where I can sit". Press **Suggest a mood** and a
*lightweight keyword heuristic* proposes a mood. This is explicitly **not a language model**: emotional words
("stressed") weigh more than situational words ("quiet"), matching is substring-based, and the suggestion is
always shown with its matched keywords and can be overridden.

**Location** — three ways, all triggered by an explicit click:

1. **“Use My Current Location”** (the prominent primary button) — calls
   `navigator.geolocation.getCurrentPosition()` once, with a visible "Asking your browser for permission…"
   loading state. On success the position is shown as **“Current GPS Location”** (with `± accuracy`), the map
   recentres on it, the start marker becomes a distinct green pulsing **“You are here”** marker, and the
   search-radius circle moves with it. Once a fix exists the same button becomes **“Refresh Location”** and
   asks for a *fresh* fix (`maximumAge: 0`) — it never replays the old value.
   Failures are explicit and actionable: permission denied, position unavailable, timeout, insecure origin and
   browsers without geolocation support each get their own message plus "Try again" / manual / example
   fallbacks.
2. **Enter coordinates manually** — validated latitude/longitude, labelled "Manual entry" (typed, not read
   from the device).
3. **Example locations** — Bengaluru, Mumbai, Delhi, Hampi, Munnar. Always labelled
   **“Example (fixed coordinates)”** with the note that they are *not* your live position.

Changing the start point (a new GPS fix, manual entry or an example) **re-runs the search with the coordinates
just obtained**, so distances and rankings are never left over from the previous origin. The nearby-place
request is sent only after those coordinates exist — never before.

Coordinates are used for the current search and are **never persisted** (the preferences endpoint stores
budget/time/radius/categories and returns `storesPreciseLocation: false`). There is no continuous tracking and
no background polling — one call per user click.

**Testing live GPS**

| Where | Works? | How |
|---|---|---|
| `npm run dev` on your own machine | ✅ best | Open <http://localhost:5173> → **Use My Current Location** → allow the browser prompt. `localhost` counts as a secure context. |
| The Arena preview **in its own tab** | ✅ usually | Open the preview URL (`https://5173-<sandbox>.e2b.app` or the API's `https://4000-<sandbox>.e2b.app`) as a top-level page and allow the prompt. It is HTTPS, so geolocation is available. |
| The app **embedded in the preview iframe** | ⚠️ often blocked | A sandboxed iframe usually has an opaque origin and no geolocation permission, so the button reports the browser refusal — **use the manual/example fallbacks there**, or open the preview in its own tab. |
| Plain-HTTP LAN IP (e.g. `http://192.168.1.5:5173`) | ❌ | Browsers only expose geolocation over HTTPS or `localhost`; SENTRA says so instead of failing silently. |

Accurate GPS also needs a device with a positioning source; desktops commonly fall back to Wi-Fi/IP location,
which can be coarse or unavailable. SENTRA never claims a fix it did not receive.

**Preferences** — budget in ₹ (with quick chips), available time (30–480 min), search radius (500 m – 5 km),
preferred categories, indoor/outdoor, trip purpose and accessibility needs. Signed-in users can save them to
their account (location excluded).

**Results** — each card shows name, category, straight-line distance, coordinates, address/opening-hours/website
metadata *when OpenStreetMap has it*, the recommendation reason, a score breakdown, a **Directions** link and
feedback controls. Clicking **Show on map** focuses the marker; clicking a marker opens its popup.

---

## 9. API reference

All responses are JSON. Errors use a consistent envelope:

```json
{ "error": { "code": "validation_failed", "message": "…", "details": ["…"] } }
```

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | – | Service + database status |
| `POST /api/auth/register` | – | Create account (name, email, password, confirmPassword) |
| `POST /api/auth/login` | – | Sign in |
| `POST /api/auth/logout` | – | Destroy session (204) |
| `GET /api/auth/me` | – | Current user or `{ "user": null }` |
| `GET /api/places/health` | – | Overpass endpoint, cache TTL, supported categories |
| `GET /api/places/nearby` | – | Nearby OSM places: `lat`, `lon`, `radius`, `categories`, `demo` |
| `GET /api/places/categories` | – | Supported category ids and their OSM tags |
| `POST /api/recommendations` | ✅ live / – demo | Ranked results + explanation metadata |
| `GET /api/recommendations/meta` | – | Mood list and scoring weights |
| `GET /api/profile` | ✅ | Own account, preferences and feedback summary |
| `PUT /api/profile/preferences` | ✅ | Save own preferences |
| `GET /api/feedback` | ✅ | Own feedback (max 200 most recent) |
| `POST /api/feedback` | ✅ | Create/update own feedback for a place |
| `DELETE /api/feedback/:id` | ✅ | Delete own feedback entry |

### Testing the nearby-place API

```bash
# live OpenStreetMap data around MG Road, Bengaluru (3 km)
curl "http://localhost:4000/api/places/nearby?lat=12.9716&lon=77.5946&radius=3000"

# only parks and gardens, capped to 1 km
curl "http://localhost:4000/api/places/nearby?lat=12.9716&lon=77.5946&radius=1000&categories=park,garden"

# clearly-labelled demo records (no external call)
curl "http://localhost:4000/api/places/nearby?lat=12.9716&lon=77.5946&demo=true"
```

State-changing requests from a browser need the CSRF token cookie echoed in a header. With curl:

```bash
# 1. fetch any endpoint to receive the sentra.csrf cookie
curl -s -c jar.txt -o /dev/null http://localhost:4000/api/auth/me
CSRF=$(awk '/sentra.csrf/ {print $7}' jar.txt | tail -1)

# 2. register (Windows PowerShell: use Invoke-WebRequest -SessionVariable)
curl -s -b jar.txt -c jar.txt -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"name":"Asha Rao","email":"asha@example.com","password":"Sunlight42","confirmPassword":"Sunlight42"}'

# 3. run a live search as that user
curl -s -b jar.txt -X POST http://localhost:4000/api/recommendations \
  -H 'Content-Type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"lat":12.9716,"lon":77.5946,"mood":"stressed","radiusM":3000,"budgetInr":300,"timeMinutes":120}'
```

**Status codes:** `400` validation/invalid coordinates · `401` not signed in / bad credentials ·
`403` CSRF or origin rejected · `404` unknown route or not your feedback · `409` duplicate email ·
`429` rate limited (auth, search) or feedback limit reached · `502/504` Overpass error/timeout · `503` database unavailable.

---

## 10. How the recommendation engine works

`server/recommend.js` is the single source of truth (`client/src/lib/scoring.js` is a documented mirror used
only by offline demo mode). Pipeline:

1. Validate preferences (zod-free, hand-written pure functions in `validate.js`).
2. Retrieve nearby places from Overpass (cached, coalesced, normalised).
3. Haversine distance from your point to each place.
4. Drop places outside the radius.
5. Match each place's category to the mood.
6. Compute component scores, all normalised to 0–100.
7. Apply the remaining preferences.
8. Sort by final score (ties broken by distance, then name).
9. Attach a plain-language reason to every result.

```
final score = 0.50 × mood/category compatibility
            + 0.30 × distance suitability
            + 0.20 × preference compatibility
            (+ feedback adjustment, see §11)
```

| Component | How it is computed |
|---|---|
| **Mood/category** | Category tier per mood: primary `100` (e.g. stressed→park/garden/nature_reserve), secondary `78`, neutral `52`, discouraged `25`. Discouraged combinations are dropped from the list. |
| **Distance** | `100 × (1 − (d / radius)^1.6)`: 100 at your position, decaying smoothly to 0 at the radius edge. |
| **Preference** | Average of the parts that apply: preferred categories (`100`/`35`), indoor/outdoor fit (`100`/`60`/`35`/`30`), explicit OSM `fee` tags (`100` free, `65`/`40` if a fee is tagged — amount unknown), and the `wheelchair` tag (`100`/`70`/`25`, neutral `55` when untagged). With no preferences set, the component is a neutral `70`. |

### Data honesty rules

* OpenStreetMap rarely stores prices, ratings, reviews, visit duration or live opening status. SENTRA therefore
  shows **“Price not available”** and **“Visit duration not available”** rather than inventing values.
* Budget filters only on an explicit `fee` tag, and an unknown price **never excludes** a place.
* Time suitability is applied **only** when a visit duration is known, which is rare in OSM — otherwise it stays neutral.
* `opening_hours` is displayed as *metadata* and is explicitly **not** evaluated for "open now".
* Every response marks provenance: `metadataSource: "openstreetmap"` for live tags, `"demo"` for samples.
* Scores are suitability indicators out of 100 — **not** AI confidence percentages.

Worked example: a park 650 m away for a stressed user with a 3 km radius →
mood 100 (`0.50×100 = 50`) + distance ≈ 88 (`0.30×88 ≈ 26`) + preferences 70 (`0.20×70 = 14`) ≈ **90/100**.

---

## 11. How feedback affects ranking

Feedback is stored in SQLite keyed by `(user_id, osm_key)` with a unique constraint, so re-submitting updates
rather than duplicates. Votes/ratings/comments are validated (vote ∈ like|dislike, integer rating 1–5,
comment ≤ 500 chars) and limited to 500 entries per account. Users can only read, update or delete their own rows.

When a signed-in user requests recommendations, their own stored feedback is loaded and applied:

| Feedback | Effect on that user's score |
|---|---|
| Like | `+6` |
| Dislike | `−10` |
| Rating | `(rating − 3) × 2` → `−4 … +4` |

The adjustment is capped so scores stay inside 0–100, is listed in the card's breakdown, and is appended to the
reason ("you liked this place before"). New users with no feedback get the default algorithm. SENTRA claims no
learning beyond this documented adjustment: there is **no** model training and no cross-user collaborative
filtering (aggregate popularity is not used).

---

## 12. Database

SQLite via `better-sqlite3` (synchronous, zero-config, prebuilt binaries, embedded — no server to run).
The file lives at `DATABASE_PATH` (`server/data/sentra.db` by default), outside any static directory, and is
**git-ignored**.

```sql
users(id, name, email UNIQUE, password_hash, created_at)
preferences(user_id PK→users, mood, categories, budget_inr, time_minutes, radius_m,
            indoor_outdoor, purpose, accessibility, last_lat, last_lon, updated_at)
feedback(id, user_id→users, osm_key, name, category, vote CHECK(like|dislike),
         rating CHECK(1..5), comment, created_at, updated_at, UNIQUE(user_id, osm_key))
sessions(sid PK, sess, expires_at)                     -- express-session store
-- indexes: feedback(osm_key), feedback(user_id), sessions(expires_at)
```

* Initialisation is **idempotent**: `CREATE TABLE IF NOT EXISTS` + indexes run on every boot and an existing
  database is **never dropped or re-seeded**.
* WAL mode and `foreign_keys = ON`; cascading deletes remove a user's preferences and feedback.
* All statements are parameterised (`?`/named parameters) — no string concatenation in SQL.
* `last_lat`/`last_lon` exist in the schema but are intentionally never written: precise coordinates are not stored.
* Deleted the file? It is recreated empty on the next start. There is **no seeded account** — register your own.
* The session table is swept of expired rows every 15 minutes.
* If SQLite were unavailable on a target platform, the lightest documented alternative is a single JSON-file
  store behind the same `db.js` interface — but no second database engine is used here.

---

## 13. OpenStreetMap attribution, tile provider & public-service limitations

### 13.1 Tile provider (and why it is not `tile.openstreetmap.org`)

* SENTRA draws its base map with tiles from **OpenStreetMap Deutschland, operated by FOSSGIS e.V.**
  (`https://tile.openstreetmap.de/{z}/{x}/{y}.png`). The style is the OSM Carto style with local-language
  labels, `maxZoom` 19, global coverage.
* Usage policy: <https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/>
  (German + English). It is a **volunteer service funded by donations** — no SLA, and embedding is permitted
  for **small, non-commercial** sites.
* **Why not the OSM Foundation's service?** `tile.openstreetmap.org` has its own
  [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) which requires every browser
  request to carry a valid `Referer` header and says referer-stripped traffic may be blocked without notice.
  In a sandboxed preview iframe (opaque origin) no `Referer` can be sent, so that service replies **HTTP 200
  with a `403 Access blocked` placeholder image** ("App is not following the tile usage policy of
  OpenStreetMap's volunteer-run servers"). Leaflet paints it as every single tile. Requests were verified to
  be blocked exactly this way from this environment, while the same URL with a `Referer` returned real map
  imagery — so the app **stopped using that host** instead of trying to work around the restriction.
* What SENTRA does to honour the FOSSGIS terms: visible **ODbL + CC-BY-SA attribution** with links to
  `openstreetmap.org/copyright` and a **"report a map issue"** (`fixthemap`) link in the map control; tiles
  are fetched by the browser only (no proxy, no server-side rewriting); no `Cache-Control: no-cache` header
  is sent; tiles are cached by the browser as the provider's `Expires`/`Cache-Control` headers dictate; no
  prefetching, no bulk download and no offline tile archive; typical use is one page = a few dozen tiles.
* **Before a public deployment:** set an operator contact address where it is easy to reach, e.g.
  `echo 'VITE_MAP_CONTACT_EMAIL=you@example.com' > client/.env` (Vite reads env files from the client
  directory). It is then shown as a "map service contact" link in the map attribution, as the FOSSGIS terms
  require a reachable operator. The env file is already covered by `.gitignore`.
* **Commercial use:** not allowed on this service — switch to a commercial OSM provider (see below).
* Verify tiles by hand (expect `200` and `image/png`, from a machine without a browser):

  ```bash
  curl -sI https://tile.openstreetmap.de/14/11723/7596.png | head -3   # z14 tile over Bengaluru
  curl -s -o /tmp/t.png -w '%{http_code} %{size_download}\n' https://tile.openstreetmap.de/17/93787/60772.png
  ```
* **Changing the tile provider** means editing exactly three places — the URL/attribution constants at the
  top of `client/src/components/SentraMap.jsx`, the `img-src` directive in the CSP in `server/app.js`, and
  the tile-host assertion in `client/test/dom-entry.jsx` — plus this section. Check the new provider's usage
  policy first; do not hard-code a service that forbids it. (Other OSM-based candidates checked during this
  work: `tile.openstreetmap.fr` — works without a `Referer`, but returned `404` for some z19 tiles;
  CARTO's public basemaps — answer with an "API KEY REQUIRED" placeholder, so a key would be needed.)

### 13.2 Data & attribution

* Map tiles and place data: **© OpenStreetMap contributors**, available under the
  [Open Database License](https://www.openstreetmap.org/copyright). Attribution is displayed on the map itself,
  in the footer and in API responses (`attribution` field).
* Nearby search uses the **public Overpass API**, a **community-operated service with no uptime guarantee,
  no SLA and no unlimited free production allowance**. It is funded by donations and shared by everyone.
* SENTRA is a polite client: queries run **only server-side** (never per component or per keystroke),
  identical searches are cached for 5 minutes, concurrent identical requests are coalesced, one request is made
  per user search, upstream timeouts are explicit, retries are not aggressive, results are capped, and a
  descriptive `User-Agent` is sent. Results are never bulk-downloaded or persisted to disk.
* **For real production use, run your own Overpass instance or use a commercial OSM provider** and point
  `OVERPASS_URL` at it. SENTRA supports that with a single environment variable.
* Directions links open <https://www.openstreetmap.org/directions> in a new tab with `rel="noopener noreferrer"`.
  SENTRA does not implement turn-by-turn navigation.

---

## 14. Demo mode

* Toggle **Demo mode** in the discovery panel, or call `GET /api/places/nearby?...&demo=true`.
* Uses **12 fictional records** bundled in `server/demoData.js` / `client/src/lib/demoPlaces.js` — no CSV, no
  large dataset, nothing stored in SQLite.
* Every surface is labelled: an amber **DEMO MODE** banner, "Illustrative sample" badges on each card, and
  `demo: true` + `demoNotice` in API responses.
* Demo mode is **never** a silent substitute for live data. If Overpass fails you get the real error
  (`retryable`, `demoAvailable: true`) plus an explicit **Use demo mode** button.
* The client-side demo also runs when the API is unreachable, so the interface can always be demonstrated.

---

## 15. Testing & quality checks

```bash
npm test        # 40 tests, ~1 second, in-memory SQLite, stubbed Overpass
```

| Suite | Covers |
|---|---|
| `server/test/recommend.test.js` | Haversine accuracy (Bengaluru pairs, one degree of latitude), distance-score monotonicity, mood→category compatibility, weight normalisation, preference scoring with unknown metadata, radius exclusion, sort order, feedback adjustment, no fabricated price/duration, "open now" not implied |
| `server/test/validate.test.js` | Email formats, registration/login validation, password rules, coordinate ranges, radius clamping, preference defaults/rejections, keyword-mood interpretation, feedback validation |
| `server/test/api.test.js` | Real Express app over HTTP: health, 404s, 401s on every protected route, validation errors, registration + bcrypt hash + HTTP-only `SameSite` cookie, CSRF rejection, duplicate-email handling, generic login failure, nearby normalisation/caching/radius clamp, demo labelling, recommendation ranking, Overpass 429 and malformed-response handling, feedback CRUD + ranking effect, profile/preferences round-trip with no location persistence, logout, re-login |
| `server/test/origin.test.js` | **Origin allow-list suite.** Asserts the CORS layer and the CSRF origin check share one policy: exact `FRONTEND_ORIGIN` plus preview origins derived from the sandbox id, opt-in patterns, refusal of foreign origins with an actionable JSON body (`forbidden_origin` + allow-list + hint), `OPTIONS` preflight (`204` + echoed origin + credentials, no wildcard), requests without an `Origin` still working, cookie flags, and `SameSite=None` forcing `Secure` |
| `client/test/dom-smoke.test.mjs` + `dom-entry.jsx` | **UI suite (82 assertions; slightly more when a transient upstream failure additionally exercises the live-search Retry path — the count follows the data).** Mounts the real React pages in a DOM and drives them against the running API: landing content, protected-route redirects, registration (including client-side validation), session establishment, profile tabs, logout, wrong-password handling, login, all 8 mood cards, keyword mood suggestion + override, demo-mode ranking (11 cards, descending scores, reasons, labelled prices, DEMO badge), the Leaflet map (FOSSGIS tile host + attribution + fixthemap link, one marker per result, user marker, radius circle, legend), directions links (`rel="noopener noreferrer"`), feedback controls, a **live Overpass search** (19 real places, categories honoured, distances inside the radius, Retry path exercised, map markers matching results), and **live location**: the prominent “Use My Current Location” button, GPS granted (`navigator.geolocation` genuinely invoked, `Current GPS Location` + `Live GPS` + `± accuracy`), a distinct `You are here` marker with the legend updated, permission denied, insecure origin, no-geolocation browsers, manual-coordinate validation, **“Refresh Location” proving a second, fresh `getCurrentPosition` call**, map re-centring (twice) proven through the tile coordinates actually requested, a live search whose request body carries the GPS coordinates and *not* the example point, and a start-point change that re-runs the search from the new origin |

**Running the UI suite.** The suite drives the real backend, so the API must be running:

```bash
# terminal 1
npm run dev:server          # or:  npm run dev   (API + web app)
# terminal 2
npm run test:ui             # from the project root, or:  npm --prefix client run test:ui
```

Notes:

* It bundles `client/test/dom-entry.jsx` with Vite, installs a lightweight DOM, shims `fetch` with a
  **cookie jar** (so sessions and the CSRF token behave exactly as in a browser) and executes against
  `http://127.0.0.1:4000` (override with `VITE_API_BASE_URL`).
* The DOM implementation (`happy-dom`) is **not** a project dependency — it would add ~5,000 files and
  ~28 MB. The runner installs it once into the OS temp directory (outside the workspace) and reuses it.
  The workspace stays inside its file/size budget.
* The suite performs 3 authentication calls. Login is rate limited to 10 attempts / 15 min / IP, so
  repeated back-to-back runs can return HTTP 429. Restart the API (the window is in-memory) or run it with
  `RATE_LIMIT_DISABLED=1 npm run dev:server` (Windows PowerShell: `$env:RATE_LIMIT_DISABLED=1; npm run dev:server`).
* The live Overpass section depends on the community service. If Overpass is slow, the suite asserts the
  app's error + **Retry** path, uses the visible Retry control, and only then requires results. If Overpass
  is genuinely unreachable, that section fails with the API's message rather than passing silently.
* If the API is not reachable the suite **skips with instructions** instead of failing.

Verified during development: production build (`vite build`), API boot, database creation, live Overpass
search through the dev proxy, the full `scripts/smoke-test.sh` run, and the DOM-based UI suite above.

**Not covered by automation:** real-browser rendering. The UI suite runs on a DOM implementation, so visual
layout, CSS breakpoints, the browser's real permission prompt (the suite drives `navigator.geolocation` through
a stub and counts the calls) and actual tile painting are verified by hand —
run the app and spot-check `/`, `/discover` (demo mode), `/dashboard` and a phone-width viewport. Geolocation
is additionally covered server-side and through the manual/example location paths. Tile serving itself was
verified over HTTP from outside the browser (status, image type and byte size for z8–z19 over Bengaluru, Mumbai,
Delhi, London, San Francisco and Sydney, **with and without a `Referer`**) — see §13.1 for the commands.

---

## 16. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `Could not reach the SENTRA API` | Backend not running. Start it (`npm run dev:server`) — it must listen on port 4000. Vite proxies `/api` there. |
| `502 / rate_limited` from a search | Overpass is busy or throttling. Press **Retry**, wait a minute, use a smaller radius, or switch on demo mode. Set `OVERPASS_URL` to another endpoint if needed. |
| `504` / "Overpass service timed out" | The heaviest query (every category over 5 km) exceeded the service's time budget. **Choosing one or two categories and a ≤3 km radius is dramatically faster** — the UI's Retry button then usually succeeds. Raise `OVERPASS_TIMEOUT_MS` for more headroom. |
| No results at all | Unnamed OSM elements are filtered out; the area may genuinely lack the categories you picked. Widen the radius (max 5 km) or add categories. |
| `Location permission was denied` | Allow location for the site, or use manual coordinates / an example location. Browsers require HTTPS or `localhost`. |
| `Browsers only share location over HTTPS` | Open the app via `https://` or `http://localhost` — not a LAN IP over plain HTTP. |
| Everything redirects to `/login` | Server-side session expired (`SESSION_TTL_SECONDS`) or the database file was deleted. Sign in again. |
| Sessions drop after every restart | `SESSION_SECRET` is unset, so a random dev secret is generated per boot. Set it in `.env`. |
| `NODE_MODULE_VERSION` / `better-sqlite3` error | The native module was built for another Node version: `npm --prefix server rebuild better-sqlite3`, or delete `server/node_modules` and reinstall. |
| `SQLITE_CANTOPEN` | Directory for `DATABASE_PATH` is unwritable. Point it somewhere writable (e.g. `DATABASE_PATH=./server/data/sentra.db`). |
| Map tiles blank | Tile requests blocked or offline. Markers, radius, distances and popups still work; the map shows a tile-warning notice. |
| Every tile shows "403 **Access blocked** … not following the tile usage policy" | You are pointed at a host that refuses your client (in a sandboxed/passed-through iframe the browser cannot send the required `Referer`). SENTRA defaults to `tile.openstreetmap.de`, which does not require one — check `TILE_URL` in `client/src/components/SentraMap.jsx` and the `img-src` CSP in `server/app.js` (§13.1). Do not try to defeat the provider's restriction; switch provider or run your own tiles. |
| **“This origin is not allowed to call the SENTRA API.”** | The page's `Origin` is not on the allow-list, so the API refused a sign-up/state-changing call. Previews are derived automatically from `E2B_SANDBOX_ID` (`PREVIEW_PORTS`); otherwise add the exact origin to `FRONTEND_ORIGIN` (comma separated) and restart the API. The JSON error lists the origins that *are* allowed. Do not widen this to `*` — credentials are in play. |
| `403 csrf_failed` | The CSRF cookie is missing (cookies blocked) or the header was not echoed. The page must load once before posting so `/api/health` can set `sentra.csrf`. Reload and retry. |
| Cookies not stored / signed out immediately | Check `COOKIE_SAMESITE` (default `lax` is right for same-origin and localhost setups) and, behind TLS, `COOKIE_SECURE=true`. `SameSite=None` only for genuine cross-site deployments and it forces `Secure`. |
| `429 Too many requests` | Rate limits hit. Authentication: 10 / 15 min / IP. Searches: 40 / 5 min / IP. Adjust via `RATE_LIMIT_*` variables. |

---

## 17. Security notes and limitations

Implemented: bcrypt password hashing (configurable work factor); HTTP-only, SameSite=Lax, Secure-in-production
session cookies; session regeneration on login and server-side destruction on logout; SQLite-backed session
store with TTL and periodic sweeping; rate limiting on authentication and public search endpoints; strict
allow-list CORS with credentials; helmet security headers including a CSP that permits only self, inline styles
(Leaflet needs them) and the FOSSGIS OSM tile host; a 64 kB JSON body limit; parameterised SQL everywhere; server-side
validation on every input; CSRF protection (SameSite + origin allow-list + signed double-submit token header);
per-user authorisation on profile and feedback; generic authentication errors and dummy-hash comparison to
avoid account enumeration; no stack traces in production responses; secrets from environment variables only;
precise coordinates never persisted and never logged; `.env` and the database git-ignored.

**This project is not security-audited and makes no such claim.** Before real production use:

1. Terminate TLS and set `COOKIE_SECURE=true`, `TRUST_PROXY=1`, `NODE_ENV=production`.
2. Set a strong, unique `SESSION_SECRET` (e.g. 48 random bytes) and rotate it periodically.
3. Run `OVERPASS_URL` against your own or a commercial Overpass instance (see §13).
4. Add a Content-Security-Policy nonce strategy if you remove inline styles, and consider a WAF/CDN.
5. Add account email verification and password reset (not implemented).
6. Add offline backups of the SQLite file, plus log shipping and monitoring.
7. Move rate limiting to a shared store (Redis) if you run more than one instance.
8. Review data-retention and privacy obligations for your jurisdiction (DPDP Act, GDPR) and publish a policy.

---

## 18. Deployment

**Single origin (simplest):** build the SPA and let Express serve it.

```bash
npm run install:all
npm run build
NODE_ENV=production SESSION_SECRET=<48-byte-hex> FRONTEND_ORIGIN=https://your-domain.example \
DATABASE_PATH=/var/lib/sentra/sentra.db npm start
```

Put nginx/Caddy in front for TLS, proxy to `127.0.0.1:4000`, and set `TRUST_PROXY=1`.

**Split origins:** host `client/dist` on a static host, run the API elsewhere, and set
`FRONTEND_ORIGIN=https://app.example.com`; build the client with `VITE_API_BASE_URL=https://api.example.com`.
Cookies are then cross-site, so keep HTTPS on both and consider `SameSite=None; Secure` (adjust in
`server/app.js`) plus a matching CORS allow-list.

**Docker sketch** (bring your own Dockerfile; nothing project-specific is required):

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm run install:all
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["npm", "start"]
```

Mount `/app/server/data` as a volume so the SQLite file survives restarts.

---

## 19. License, credits and contact

Educational project. Code: use it as you wish. **Place data and map tiles remain © OpenStreetMap contributors**
under the ODbL — keep the attribution visible if you deploy this. Overpass API courtesy of the OpenStreetMap
community. Built with React, Vite, Leaflet, Express and SQLite. No Google API keys, no paid mapping, AI or
authentication services are used anywhere in this project.
