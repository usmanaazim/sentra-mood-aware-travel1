/**
 * Origin allow-list tests: the CORS layer and the CSRF origin check must agree,
 * browser preview origins must work, and everything else must be refused with a
 * useful JSON error.
 *
 * The environment is set before importing the app because config.js reads it at
 * module load (each test file runs in its own process).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SANDBOX_ID = 'testsandbox1234567890';
const PREVIEW_5173 = `https://5173-${SANDBOX_ID}.e2b.app`;
const PREVIEW_4000 = `https://4000-${SANDBOX_ID}.e2b.app`;

process.env.NODE_ENV = 'test';
process.env.SENTRA_QUIET = '1';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.DATABASE_PATH = ':memory:';
process.env.FRONTEND_ORIGIN = 'https://app.example.com';
process.env.E2B_SANDBOX_ID = SANDBOX_ID;
process.env.PREVIEW_PORTS = '5173,4000';
process.env.FRONTEND_ORIGIN_PATTERNS = 'https://*.preview.example.net';

const { createApp } = await import('../app.js');
const { allowedOrigins, config, isAllowedOrigin, originPolicy } = await import('../config.js');

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const runWithEnv = (env) => {
  const out = execFileSync(
    process.execPath,
    ['-e', "import('./config.js').then((m) => console.log(JSON.stringify({ secure: m.config.COOKIE_SECURE, sameSite: m.config.COOKIE_SAMESITE })))"],
    { cwd: path.join(serverDir, '..'), env: { ...process.env, ...env }, encoding: 'utf8' }
  );
  const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  return JSON.parse(line);
};

let app;
let server;
let base;

test.before(async () => {
  app = createApp({ dbPath: ':memory:', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"elements":[]}' }) });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server?.close();
  app?.close?.();
});

const post = (pathname, origin, body = {}) => fetch(`${base}${pathname}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(origin ? { origin } : {})
  },
  body: JSON.stringify(body)
});

const preflight = (pathname, origin) => fetch(`${base}${pathname}`, {
  method: 'OPTIONS',
  headers: {
    origin,
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type,x-csrf-token'
  }
});

test('allowed origins include the configured frontend and the derived preview hosts', () => {
  const origins = allowedOrigins();
  assert.ok(origins.includes('https://app.example.com'), 'FRONTEND_ORIGIN is honoured');
  assert.ok(origins.includes(PREVIEW_5173), 'the web preview origin is derived from E2B_SANDBOX_ID');
  assert.ok(origins.includes(PREVIEW_4000), 'the API preview origin is derived from E2B_SANDBOX_ID');
  assert.equal(origins.includes('*'), false, 'no wildcard is ever added to the list');

  const policy = originPolicy();
  assert.match(policy.derivedFrom || '', /E2B_SANDBOX_ID/);
  assert.deepEqual(policy.previewPorts, ['5173', '4000']);
});

test('isAllowedOrigin: exact origins, preview hosts, patterns and rejections', () => {
  assert.equal(isAllowedOrigin('https://app.example.com'), true);
  assert.equal(isAllowedOrigin('https://app.example.com/'), true, 'a trailing slash is tolerated');
  assert.equal(isAllowedOrigin(PREVIEW_5173), true);
  assert.equal(isAllowedOrigin(PREVIEW_4000), true);
  assert.equal(isAllowedOrigin('https://5173-testsandbox1234567890.e2b.app'), true);
  assert.equal(isAllowedOrigin('https://anything.preview.example.net'), true, 'opt-in pattern matches');
  assert.equal(isAllowedOrigin('https://evil.example.com'), false);
  assert.equal(isAllowedOrigin('http://localhost:3000'), false);
  assert.equal(isAllowedOrigin('https://5173-othersandbox.e2b.app'), false, 'a different sandbox id is not allowed');
  assert.equal(isAllowedOrigin(undefined), true, 'no Origin header = non-browser client');
});

test('state-changing request from a preview origin passes the origin gate', async () => {
  for (const origin of [PREVIEW_4000, PREVIEW_5173, 'https://app.example.com']) {
    const res = await post('/api/auth/register', origin, { name: 'A', email: 'a@example.com', password: 'Testing42', confirmPassword: 'Testing42' });
    const body = await res.json();
    // The CSRF token is missing in this raw request, which proves we got PAST the
    // origin check - before the fix this returned forbidden_origin instead.
    assert.equal(res.status, 403, `${origin} should reach the CSRF check`);
    assert.equal(body.error.code, 'csrf_failed', `${origin} must not be rejected as a forbidden origin`);
  }
});

test('a foreign origin is refused with an actionable JSON error (not a generic failure)', async () => {
  const res = await post('/api/auth/register', 'https://evil.example.com', { name: 'x', email: 'x@example.com', password: 'Testing42' });
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.error.code, 'forbidden_origin');
  assert.match(body.error.message, /not allowed to call the SENTRA API/);
  assert.equal(body.error.details.origin, 'https://evil.example.com');
  assert.ok(Array.isArray(body.error.details.allowedOrigins) && body.error.details.allowedOrigins.length > 0, 'the allow-list is disclosed for debugging');
  assert.match(body.error.details.hint, /FRONTEND_ORIGIN/);
});

test('a foreign origin cannot read the API either (explicit allow-list, GET included)', async () => {
  const res = await fetch(`${base}/api/health`, { headers: { origin: 'https://evil.example.com' } });
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.error.code, 'forbidden_origin');
});

test('requests without an Origin header still work (curl, tests, same-origin)', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('OPTIONS preflight from an allowed origin echoes the exact origin with credentials', async () => {
  const res = await preflight('/api/auth/register', PREVIEW_4000);
  await res.text();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), PREVIEW_4000);
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.notEqual(res.headers.get('access-control-allow-origin'), '*', 'wildcard + credentials is never used');
  assert.match(res.headers.get('access-control-allow-methods') || '', /POST/);
  assert.match(res.headers.get('access-control-allow-headers') || '', /x-csrf-token/i);
});

test('OPTIONS preflight from a foreign origin is refused and sends no CORS headers', async () => {
  const res = await preflight('/api/auth/register', 'https://evil.example.com');
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.error.code, 'forbidden_origin');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
});

test('cookie flags follow the configuration (HttpOnly session, readable CSRF token)', async () => {
  const res = await fetch(`${base}/api/health`);
  await res.text();
  const cookies = res.headers.getSetCookie();
  const csrf = cookies.find((c) => c.startsWith(`${config.CSRF_COOKIE_NAME}=`));
  assert.ok(csrf, 'the CSRF cookie is issued');
  assert.match(csrf, /SameSite=Lax/i);
  assert.doesNotMatch(csrf, /HttpOnly/i, 'the client must be able to echo it');
  assert.equal(config.COOKIE_SAMESITE, 'lax');
  assert.equal(config.COOKIE_SECURE, false, 'not Secure in development (plain HTTP preview)');
});

test('SameSite=None forces Secure, and a bad value falls back to lax', () => {
  const none = runWithEnv({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: '0' });
  assert.equal(none.sameSite, 'none');
  assert.equal(none.secure, true, 'browsers reject SameSite=None without Secure');

  const strict = runWithEnv({ COOKIE_SAMESITE: 'strict', COOKIE_SECURE: '0' });
  assert.equal(strict.sameSite, 'strict');
  assert.equal(strict.secure, false);

  const bad = runWithEnv({ COOKIE_SAMESITE: 'sideways' });
  assert.equal(bad.sameSite, 'lax', 'an invalid value never disables the protection');
});
