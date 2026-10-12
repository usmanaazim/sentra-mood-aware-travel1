/**
 * End-to-end API tests over the real Express app with an in-memory database.
 * A stub fetch is injected so Overpass is never called from tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SENTRA_QUIET = '1';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.DATABASE_PATH = ':memory:';

const { createApp } = await import('../app.js');
const { config } = await import('../config.js');

const OVERPASS_STUB = {
  elements: [
    { type: 'node', id: 101, lat: 12.9720, lon: 77.5950, tags: { name: 'Test Park', leisure: 'park', fee: 'no' } },
    { type: 'way', id: 202, center: { lat: 12.9735, lon: 77.5960 }, tags: { name: 'Test Garden', leisure: 'garden', opening_hours: 'Mo-Su 06:00-18:00' } },
    { type: 'node', id: 303, lat: 12.9740, lon: 77.5970, tags: { name: 'Test Cafe', amenity: 'cafe' } },
    { type: 'node', id: 404, lat: 12.9745, lon: 77.5980, tags: { amenity: 'cafe' } }, // unnamed -> filtered
    { type: 'node', id: 505, lat: 1, lon: 1, tags: { name: 'Far Park', leisure: 'park' } } // outside radius
  ]
};

let app;
let server;
let base;
let client;
let fetchCalls = 0;
const coordinator = { name: 'Integration Traveler', email: 'integration@example.com', password: 'MangoTree77', confirmPassword: 'MangoTree77' };

const stubFetch = async () => {
  fetchCalls += 1;
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(OVERPASS_STUB)
  };
};

test.before(async () => {
  app = createApp({ dbPath: ':memory:', fetchImpl: stubFetch });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  client = makeClient(base);
});

test.after(() => {
  server?.close();
  app?.close?.();
});

/** Small cookie-aware request helper (no extra dependencies). */
function makeClient(origin) {
  const jar = new Map();
  const saveCookies = (res) => {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      if (value === '') jar.delete(name); else jar.set(name, value);
    }
  };
  const cookieHeader = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

  async function api(method, pathname, body, { csrf = true, withCookies = true } = {}) {
    // The server issues a CSRF cookie on any response; fetch one up front.
    if (!jar.has(config.CSRF_COOKIE_NAME)) {
      const warm = await fetch(`${origin}/api/health`);
      saveCookies(warm);
      await warm.text();
    }
    const headers = {};
    if (withCookies && jar.size) headers.cookie = cookieHeader();
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (csrf && jar.has(config.CSRF_COOKIE_NAME)) headers[config.CSRF_HEADER] = jar.get(config.CSRF_COOKIE_NAME);
    const res = await fetch(`${origin}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    saveCookies(res);
    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch { /* non-JSON */ } }
    return { status: res.status, json, text, headers: res.headers };
  }

  return { api, jar, cookieHeader };
}

test('GET /api/health reports service and database status', async () => {
  const res = await client.api('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
  assert.equal(res.json.database, 'connected');
});

test('unknown API routes return a consistent JSON 404', async () => {
  const res = await client.api('GET', '/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'not_found');
});

test('protected endpoints reject unauthenticated requests with 401', async () => {
  for (const [method, path, body] of [
    ['GET', '/api/profile', undefined],
    ['PUT', '/api/profile/preferences', { lat: 12.97, lon: 77.59 }],
    ['GET', '/api/feedback', undefined],
    ['POST', '/api/feedback', { osmKey: 'node/1', vote: 'like' }],
    ['POST', '/api/recommendations', { lat: 12.97, lon: 77.59 }]
  ]) {
    const res = await client.api(method, path, body);
    assert.equal(res.status, 401, `${method} ${path} should require auth`);
    assert.equal(res.json.error.code, 'unauthorized');
  }
});

test('anonymous visitors can use demo mode but not live searches', async () => {
  const visitor = makeClient(base);
  const live = await visitor.api('POST', '/api/recommendations', { lat: 12.9716, lon: 77.5946, mood: 'calm' });
  assert.equal(live.status, 401, 'live searches need an account');

  const demo = await visitor.api('POST', '/api/recommendations', { lat: 12.9716, lon: 77.5946, mood: 'calm', demo: true });
  assert.equal(demo.status, 200);
  assert.equal(demo.json.demo, true);
  assert.ok(demo.json.results.length > 0, 'demo results render without an account');

  const demoPlaces = await visitor.api('GET', '/api/places/nearby?lat=12.9716&lon=77.5946&demo=1');
  assert.equal(demoPlaces.status, 200);
  assert.equal(demoPlaces.json.demo, true);
});

test('GET /api/auth/me returns null user when signed out', async () => {
  const res = await client.api('GET', '/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.json.user, null);
});

test('registration rejects invalid input with field-level errors', async () => {
  const res = await client.api('POST', '/api/auth/register', { name: 'X', email: 'bad-email', password: 'short', confirmPassword: 'nope' });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'validation_failed');
  assert.ok(res.json.error.details.length >= 3);
});

test('registration creates an account, hashes the password and starts a session', async () => {
  const res = await client.api('POST', '/api/auth/register', coordinator);
  assert.equal(res.status, 201);
  assert.equal(res.json.user.email, coordinator.email);
  assert.equal(res.json.user.passwordHash, undefined);
  assert.equal(res.json.user.password_hash, undefined);

  // The session cookie must be HTTP-only and SameSite-protected.
  const setCookie = (res.headers.getSetCookie() || []).join('; ');
  assert.match(setCookie, new RegExp(`${config.SESSION_COOKIE_NAME}=`), 'session cookie issued');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);

  const db = app.locals.db;
  const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(coordinator.email);
  assert.ok(row.password_hash.startsWith('$2'), 'bcrypt hash expected');
  assert.notEqual(row.password_hash, coordinator.password);

  const me = await client.api('GET', '/api/auth/me');
  assert.equal(me.json.user.email, coordinator.email);
  assert.equal(me.json.csrfToken, undefined, 'CSRF tokens live in their own cookie, not in the JSON body');
});

test('duplicate registration is rejected without leaking account existence', async () => {
  const res = await client.api('POST', '/api/auth/register', coordinator);
  assert.equal(res.status, 409);
  assert.match(res.json.error.message, /cannot be used/);
});

test('state-changing requests without the CSRF token are refused', async () => {
  const res = await client.api('POST', '/api/feedback', { osmKey: 'node/101', vote: 'like' }, { csrf: false });
  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, 'csrf_failed');
});

test('wrong credentials return a generic 401', async () => {
  const res = await client.api('POST', '/api/auth/login', { email: coordinator.email, password: 'WrongPass99' });
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, 'invalid_credentials');
  assert.match(res.json.error.message, /incorrect/);
});

test('GET /api/places/nearby validates coordinates', async () => {
  const missing = await client.api('GET', '/api/places/nearby');
  assert.equal(missing.status, 400);
  assert.equal(missing.json.error.code, 'invalid_coordinates');

  const outOfRange = await client.api('GET', '/api/places/nearby?lat=999&lon=77');
  assert.equal(outOfRange.status, 400);

  const badCategory = await client.api('GET', '/api/places/nearby?lat=12.9716&lon=77.5946&categories=park,spaceport');
  assert.equal(badCategory.status, 400);
  assert.equal(badCategory.json.error.code, 'invalid_categories');
});

test('GET /api/places/nearby returns normalised OSM places and clamps the radius', async () => {
  const before = fetchCalls;
  const res = await client.api('GET', '/api/places/nearby?lat=12.9716&lon=77.5946&radius=999999');
  assert.equal(res.status, 200);
  assert.equal(res.json.radiusM, 5000, 'radius clamped to the supported maximum');
  assert.equal(res.json.demo, false);
  assert.equal(res.json.source, 'overpass');
  assert.equal(fetchCalls, before + 1, 'exactly one upstream request');

  const names = res.json.places.map((p) => p.name).sort();
  assert.deepEqual(names, ['Test Cafe', 'Test Garden', 'Test Park']);
  assert.ok(res.json.places.every((p) => p.osmKey && Number.isFinite(p.lat)));
  assert.ok(res.json.places.every((p) => p.priceKnown === false && p.priceEstimate === null), 'prices are never invented');

  const second = await client.api('GET', '/api/places/nearby?lat=12.9716&lon=77.5946&radius=999999');
  assert.equal(second.json.cached, true, 'second identical search is served from cache');
  assert.equal(fetchCalls, before + 1, 'cache prevented a second upstream request');
});

test('demo mode is explicit and clearly labelled', async () => {
  const res = await client.api('GET', '/api/places/nearby?lat=12.9716&lon=77.5946&demo=true');
  assert.equal(res.status, 200);
  assert.equal(res.json.demo, true);
  assert.match(res.json.demoNotice, /DEMO DATA/i);
  assert.ok(res.json.places.length <= 15);
  assert.ok(res.json.places.every((p) => p.fictional === true));
});

test('POST /api/recommendations ranks places and explainseach result', async () => {
  const res = await client.api('POST', '/api/recommendations', {
    lat: 12.9716, lon: 77.5946, mood: 'stressed', radiusM: 3000, budgetInr: 300, timeMinutes: 120
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.count >= 1);
  const [first] = res.json.results;
  assert.equal(first.name, 'Test Park', 'park ranks first for a stressed mood');
  assert.ok(first.score > 0 && first.score <= 100);
  assert.match(first.reasons[0], /Recommended because/);
  assert.equal(first.priceText, 'Price not available');
  assert.match(res.json.method, /No trained machine-learning model/);
  assert.equal(res.json.demo, false);

  const demo = await client.api('POST', '/api/recommendations', { lat: 12.9716, lon: 77.5946, mood: 'bored', demo: true });
  assert.equal(demo.json.demo, true);
  assert.match(demo.json.demoNotice, /DEMO DATA/i);
  assert.ok(demo.json.results.length > 0);
});

test('POST /api/recommendations surfaces an Overpass failure with retry + demo hints', async () => {
  // A throwaway app whose upstream always rate-limits.
  const failing = createApp({
    dbPath: ':memory:',
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'rate limited' })
  });
  const s2 = failing.listen(0, '127.0.0.1');
  try {
    await new Promise((r) => s2.once('listening', r));
    const throwaway = makeClient(`http://127.0.0.1:${s2.address().port}`);

    const reg = await throwaway.api('POST', '/api/auth/register', {
      name: 'Failure Tester', email: 'failure@example.com', password: 'Raining42', confirmPassword: 'Raining42'
    });
    assert.equal(reg.status, 201);

    const res = await throwaway.api('POST', '/api/recommendations', { lat: 12.9716, lon: 77.5946, mood: 'calm' });
    assert.equal(res.status, 429);
    assert.equal(res.json.error.code, 'rate_limited');
    assert.equal(res.json.error.retryable, true);
    assert.equal(res.json.error.demoAvailable, true);

    // A malformed upstream payload is reported as a bad response, not a crash.
    const broken = createApp({ dbPath: ':memory:', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html>not json</html>' }) });
    const s3 = broken.listen(0, '127.0.0.1');
    try {
      await new Promise((r) => s3.once('listening', r));
      const c3 = makeClient(`http://127.0.0.1:${s3.address().port}`);
      await c3.api('POST', '/api/auth/register', { name: 'Broken Tester', email: 'broken@example.com', password: 'Raining42', confirmPassword: 'Raining42' });
      const bad = await c3.api('POST', '/api/recommendations', { lat: 12.9716, lon: 77.5946, mood: 'calm' });
      assert.equal(bad.status, 502);
      assert.equal(bad.json.error.code, 'bad_response');
    } finally {
      s3.close();
      broken.close();
    }
  } finally {
    s2.close();
    failing.close();
  }
});

test('feedback is stored, scoped to the user and reflected in later ranking', async () => {
  const created = await client.api('POST', '/api/feedback', { osmKey: 'node/303', name: 'Test Cafe', category: 'cafe', vote: 'like', rating: 5, comment: 'Great filter coffee.' });
  assert.equal(created.status, 201);
  assert.equal(created.json.feedback.vote, 'like');

  const listed = await client.api('GET', '/api/feedback');
  assert.equal(listed.json.count, 1);

  const invalidRating = await client.api('POST', '/api/feedback', { osmKey: 'node/303', rating: 9 });
  assert.equal(invalidRating.status, 400);

  // Feedback nudges this user's own ranking of that place.
  const withFeedback = await client.api('POST', '/api/recommendations', { lat: 12.9716, lon: 77.5946, mood: 'happy', radiusM: 3000 });
  const cafe = withFeedback.json.results.find((r) => r.osmKey === 'node/303');
  assert.ok(cafe, 'cafe is present in happy-mood results');
  assert.equal(withFeedback.json.feedbackUsed, true);
  assert.ok(cafe.breakdown.feedbackAdjustment > 0);

  const id = created.json.feedback.id;
  const deleted = await client.api('DELETE', `/api/feedback/${id}`);
  assert.equal(deleted.status, 204);

  const otherUserDelete = await client.api('DELETE', '/api/feedback/999999');
  assert.equal(otherUserDelete.status, 404);
});

test('profile returns only the signed-in user, and preferences round-trip', async () => {
  const res = await client.api('GET', '/api/profile');
  assert.equal(res.status, 200);
  assert.equal(res.json.user.email, coordinator.email);
  assert.equal(res.json.user.password_hash, undefined);

  const saved = await client.api('PUT', '/api/profile/preferences', {
    mood: 'calm', categories: ['park', 'garden'], budgetInr: 400, timeMinutes: 90, radiusM: 2500, indoorOutdoor: 'outdoor', purpose: 'quiet walk'
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.preferences.mood, 'calm');
  assert.deepEqual(saved.json.preferences.categories, ['park', 'garden']);

  const invalid = await client.api('PUT', '/api/profile/preferences', { mood: 'furious' });
  assert.equal(invalid.status, 400);

  // Precise coordinates must never be persisted.
  const row = app.locals.db.prepare('SELECT last_lat, last_lon FROM preferences WHERE user_id = ?').get(res.json.user.id);
  assert.equal(row.last_lat, null);
  assert.equal(row.last_lon, null);
});

test('logout destroys the session and clears the cookie', async () => {
  const res = await client.api('POST', '/api/auth/logout');
  assert.equal(res.status, 204);
  const me = await client.api('GET', '/api/auth/me');
  assert.equal(me.json.user, null);
  const protectedRes = await client.api('GET', '/api/profile');
  assert.equal(protectedRes.status, 401);
});

test('login works after logout with the same credentials', async () => {
  const res = await client.api('POST', '/api/auth/login', { email: coordinator.email, password: coordinator.password });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.email, coordinator.email);
  const me = await client.api('GET', '/api/auth/me');
  assert.equal(me.json.user.email, coordinator.email);
});
