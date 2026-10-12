#!/usr/bin/env bash
# SENTRA end-to-end API smoke test (macOS / Linux / Git Bash on Windows).
#   1. start the backend:  npm --prefix server start
#   2. run:                bash scripts/smoke-test.sh
#
# It exercises: health, registration, session, live Overpass search,
# recommendations, feedback, profile, CSRF rejection and logout.
set -euo pipefail

API="${SENTRA_API:-http://localhost:4000}"
JAR="$(mktemp)"
EMAIL="smoke$(date +%s)@example.com"
PASS="Bengaluru42"

# cookie + header helper (CSRF token is a non-HTTP-only cookie, echoed in a header)
req() { # method path [json-body]
  local method="$1" path="$2" body="${3:-}"
  local -a args=(-s -o /tmp/sentra-smoke.json -w '%{http_code}' -X "$method" -c "$JAR" -b "$JAR" "$API$path")
  local csrf
  csrf=$(awk '/sentra.csrf/ {print $7}' "$JAR" | tail -1)
  if [ -n "$csrf" ]; then args+=(-H "x-csrf-token: $csrf"); fi
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  curl "${args[@]}"
}

# The browser origin used for the CORS + CSRF origin allow-list checks.
# Arena/E2B serves every port at https://<port>-<sandboxId>.e2b.app, and the API
# derives those origins from E2B_SANDBOX_ID; override with SENTRA_ORIGIN.
ORIGIN="${SENTRA_ORIGIN:-}"
if [ -z "$ORIGIN" ] && [ -n "${E2B_SANDBOX_ID:-}" ]; then
  ORIGIN="https://${SENTRA_PREVIEW_PORT:-4000}-${E2B_SANDBOX_ID}.e2b.app"
fi
[ -n "$ORIGIN" ] || ORIGIN="http://localhost:5173"

JAR2="$(mktemp)"
EMAIL2="origin$(date +%s)@example.com"

# Same as req(), but sends an Origin header like a browser does, using a second
# cookie jar so this session is independent of the one req() maintains.
req_origin() { # method path [json-body]
  local method="$1" path="$2" body="${3:-}"
  local -a args=(-s -o /tmp/sentra-smoke2.json -w '%{http_code}' -X "$method" -c "$JAR2" -b "$JAR2"
                 -H "Origin: $ORIGIN" "$API$path")
  local csrf
  csrf=$(awk '/sentra.csrf/ {print $7}' "$JAR2" | tail -1)
  if [ -n "$csrf" ]; then args+=(-H "x-csrf-token: $csrf"); fi
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  curl "${args[@]}"
}

show2() { head -c "${1:-420}" /tmp/sentra-smoke2.json; echo; }

step() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
show() { head -c "${2:-420}" /tmp/sentra-smoke.json; echo; }

step "1. Service health"
echo "HTTP $(req GET /api/health)"; show 260

step "2. Nearby-place service status"
echo "HTTP $(req GET /api/places/health)"; show 300

step "3. Protected endpoint rejects anonymous callers"
echo "HTTP $(req GET /api/profile) (expected 401)"; show 160

step "4. Register a throwaway account"
echo "HTTP $(req POST /api/auth/register "{\"name\":\"Smoke Tester\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"confirmPassword\":\"$PASS\"}")"; show 200

step "5. Session status (GET /api/auth/me)"
echo "HTTP $(req GET /api/auth/me)"; show 200

step "6. LIVE nearby search (public Overpass API + OpenStreetMap)"
echo "HTTP $(req GET '/api/places/nearby?lat=12.9716&lon=77.5946&radius=3000&categories=park,garden,cafe')"
node -e "
const d=require('/tmp/sentra-smoke.json');
if (d.error) {
  console.log('Overpass reported:', d.error.code, '-', d.error.message);
  console.log('(documented behaviour: the public service is community-run; the UI offers Retry + demo mode)');
} else {
  console.log('source:',d.source,'| count:',d.count,'| cached:',d.cached,'| radiusM:',d.radiusM);
  (d.places||[]).slice(0,6).forEach(p=>console.log('  -',p.name||'(unnamed)','|',p.category,'|',p.distanceM+'m','|',p.osmKey));
}" 2>/dev/null || show 300

step "7. Recommendations for a stressed mood (parks/gardens, 3 km)"
echo "HTTP $(req POST /api/recommendations '{"lat":12.9716,"lon":77.5946,"mood":"stressed","radiusM":3000,"categories":["park","garden"],"budgetInr":300,"timeMinutes":120}')"
node -e "
const d=require('/tmp/sentra-smoke.json');
if (d.error) { console.log('Overpass reported:', d.error.code, '-', d.error.message); }
else {
  console.log('mood:',d.mood&&d.mood.label,'| results:',d.count,'| demo:',d.demo);
  (d.results||[]).slice(0,5).forEach(r=>console.log('  ',r.score+'/100',r.name,'-',r.distanceM+'m -',r.reasons[0]));
  console.log('priceText sample:',(d.results||[{}])[0].priceText);
}" 2>/dev/null || show 300

step "8. Demo mode (clearly labelled illustrative data)"
echo "HTTP $(req POST /api/recommendations '{"lat":12.9716,"lon":77.5946,"mood":"bored","demo":true}')"
node -e "const d=require('/tmp/sentra-smoke.json');console.log('demo:',d.demo,'|',d.demoNotice,'| results:',d.count);" 2>/dev/null || show 200

step "9. Save feedback (like + rating)"
echo "HTTP $(req POST /api/feedback '{"osmKey":"node/123456789","name":"Smoke Test Cafe","category":"cafe","vote":"like","rating":5,"comment":"Quick smoke test."}')"; show 240

step "10. Read feedback + profile"
echo "HTTP $(req GET /api/feedback) for feedback"; show 200
echo "HTTP $(req GET /api/profile) for profile"
node -e "const d=require('/tmp/sentra-smoke.json');console.log('user:',d.user.email,'| saved mood:',d.preferences.mood,'| feedback:',d.feedback.total);" 2>/dev/null || show 200

step "11. Save preferences"
echo "HTTP $(req PUT /api/profile/preferences '{"mood":"calm","categories":["park","garden"],"budgetInr":400,"timeMinutes":90,"radiusM":2500,"indoorOutdoor":"outdoor"}')"; show 220

step "12. CSRF protection (state-changing call without the token header)"
echo "HTTP $(curl -s -o /tmp/sentra-smoke.json -w '%{http_code}' -X POST -b "$JAR" -H 'Content-Type: application/json' -d '{"osmKey":"node/1","vote":"like"}' "$API/api/feedback") (expected 403)"; show 160

step "13. Logout, then confirm the session is gone"
echo "HTTP $(req POST /api/auth/logout)"; show 120
echo "HTTP $(req GET /api/profile) (expected 401)"; show 160

step "14. Registration + login from the browser origin ($ORIGIN)"
# A browser loads the page first, which issues the CSRF cookie; prime the jar the
# same way (the double-submit token is required on every state-changing call).
echo "HTTP $(req_origin GET /api/health) (primes the CSRF cookie)"
echo "HTTP $(req_origin POST /api/auth/register "{\"name\":\"Origin Tester\",\"email\":\"$EMAIL2\",\"password\":\"$PASS\",\"confirmPassword\":\"$PASS\"}") (expected 201)"
show2 200
echo "HTTP $(req_origin POST /api/auth/register "{\"name\":\"Origin Tester\",\"email\":\"$EMAIL2\",\"password\":\"$PASS\",\"confirmPassword\":\"$PASS\"}") (duplicate, expected 409)"
show2 200
echo "HTTP $(req_origin POST /api/auth/login "{\"email\":\"$EMAIL2\",\"password\":\"WrongPass99\"}") (wrong password, expected 401)"
show2 160
echo "HTTP $(req_origin POST /api/auth/login "{\"email\":\"$EMAIL2\",\"password\":\"$PASS\"}") (correct password, expected 200)"
show2 160
echo "HTTP $(req_origin GET /api/auth/me) (session persisted, expected 200)"
echo "HTTP $(req_origin GET /api/profile) (protected route, expected 200)"
show2 200
node -e "const d=require('/tmp/sentra-smoke2.json');const p=d.preferences||{};console.log('precise coordinates stored by the account:',('lat' in p)||('lon' in p),'| storesPreciseLocation:',p.storesPreciseLocation??'(not sent by GET)');" 2>/dev/null || show2 220
echo "HTTP $(req_origin POST /api/auth/logout) (expected 204)"
echo "HTTP $(req_origin GET /api/profile) (after logout, expected 401)"

step "15. CORS preflight and a foreign origin are handled explicitly"
printf '  preflight from %s -> HTTP ' "$ORIGIN"
curl -s -o /dev/null -D /tmp/sentra-cors.h -w '%{http_code}\n' -X OPTIONS "$API/api/auth/register" \
  -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,x-csrf-token'
grep -iE '^access-control-allow-(origin|credentials)' /tmp/sentra-cors.h | tr -d '\r' | sed 's/^/    /'
printf '  foreign origin (https://evil.example.com) -> HTTP '
curl -s -o /tmp/sentra-smoke2.json -w '%{http_code}\n' -X POST "$API/api/auth/register" \
  -H 'Origin: https://evil.example.com' -H 'Content-Type: application/json' \
  -d '{"name":"x","email":"x@example.com","password":"Testing42","confirmPassword":"Testing42"}'
node -e "const d=require('/tmp/sentra-smoke2.json');console.log('    code:',d.error&&d.error.code,'| message:',d.error&&d.error.message);" 2>/dev/null || show2 200

rm -f "$JAR" "$JAR2" /tmp/sentra-smoke.json /tmp/sentra-smoke2.json /tmp/sentra-cors.h
printf '\n\033[32mSmoke test finished.\033[0m\n'
