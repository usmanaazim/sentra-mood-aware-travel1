/**
 * Central configuration. Reads environment variables (root .env then server/.env)
 * and exposes safe defaults for local development.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
/** server/ directory */
export const SERVER_ROOT = here;
/** sentra/ project root (parent of server/) */
export const PROJECT_ROOT = path.resolve(here, '..');

// Root .env wins over server/.env only if server/.env does not define the key.
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
dotenv.config({ path: path.join(SERVER_ROOT, '.env'), override: true });

const isTest = process.env.NODE_ENV === 'test';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

/** Resolve DATABASE_PATH against the server directory; creates the parent folder. */
function resolveDatabasePath() {
  const raw = process.env.DATABASE_PATH || path.join('server', 'data', 'sentra.db');
  if (raw === ':memory:' || raw.startsWith('file:')) return raw;
  const abs = path.isAbsolute(raw) ? raw : path.join(PROJECT_ROOT, raw);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return abs;
}

/** Session secret: required in production, generated per-boot (with a warning) in dev. */
function resolveSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16 && !secret.startsWith('replace-with')) return secret;
  if (IS_PROD) {
    throw new Error('SESSION_SECRET must be set to a strong random value in production. See .env.example.');
  }
  if (!isTest && !process.env.SENTRA_QUIET) {
    console.warn('[sentra] SESSION_SECRET not set - using a random development secret (sessions reset on restart).');
  }
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Allowed browser origins. CORS and the CSRF origin check both use
 * `isAllowedOrigin()` below, so the two can never drift apart.
 *
 *   FRONTEND_ORIGIN           exact origins, comma/space separated
 *   E2B_SANDBOX_ID            the Arena/E2B preview serves every listening port
 *                             at https://<port>-<sandboxId>.e2b.app, so the exact
 *                             preview origins are derived from the platform id
 *                             (never a wildcard)
 *   PREVIEW_PORTS             ports to derive preview origins for (default 5173,4000)
 *   PREVIEW_HOSTS             extra explicit preview hostnames (scheme optional)
 *   FRONTEND_ORIGIN_PATTERNS  opt-in glob patterns, e.g. https://5173-*.e2b.app
 */
const splitList = (value) => String(value || '').split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean);
const normaliseOrigin = (value) => String(value).replace(/\/+$/, '');

const FRONTEND_ORIGIN = splitList(process.env.FRONTEND_ORIGIN || 'http://localhost:5173').map(normaliseOrigin);
const FRONTEND_ORIGIN_PATTERNS = splitList(process.env.FRONTEND_ORIGIN_PATTERNS);
const SANDBOX_ID = String(process.env.E2B_SANDBOX_ID || process.env.SANDBOX_ID || '').trim();
const PREVIEW_PORTS = splitList(process.env.PREVIEW_PORTS || '5173,4000');
const PREVIEW_HOSTS = splitList(process.env.PREVIEW_HOSTS)
  .map((host) => (host.includes('://') ? normaliseOrigin(host) : `https://${host}`));

/** Preview origins derived from the sandbox id plus any explicitly listed hosts. */
function previewOrigins() {
  const origins = [];
  if (SANDBOX_ID) {
    for (const port of PREVIEW_PORTS) origins.push(`https://${port}-${SANDBOX_ID}.e2b.app`);
  }
  origins.push(...PREVIEW_HOSTS);
  return origins;
}

const COOKIE_SAMESITE = (() => {
  const value = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase().trim();
  if (['lax', 'strict', 'none'].includes(value)) return value;
  console.warn(`[sentra] COOKIE_SAMESITE="${value}" is not lax|strict|none - falling back to "lax".`);
  return 'lax';
})();

/**
 * Browsers reject SameSite=None without Secure, so asking for a cross-site
 * cookie automatically turns Secure on - security is never relaxed to make an
 * error go away.
 */
const COOKIE_SECURE = bool(process.env.COOKIE_SECURE, IS_PROD) || COOKIE_SAMESITE === 'none';

export const config = {
  NODE_ENV,
  IS_PROD,
  IS_TEST: isTest,
  PORT: num(process.env.PORT, 4000),
  FRONTEND_ORIGIN,
  SESSION_SECRET: resolveSessionSecret(),
  DATABASE_PATH: resolveDatabasePath(),
  OVERPASS_URL: process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
  OVERPASS_TIMEOUT_MS: num(process.env.OVERPASS_TIMEOUT_MS, 25000),
  OVERPASS_USER_AGENT:
    process.env.OVERPASS_USER_AGENT || 'SENTRA/1.0 (mood-aware travel discovery; https://github.com/sentra)',
  PLACES_CACHE_TTL_MS: num(process.env.PLACES_CACHE_TTL_MS, 5 * 60 * 1000),
  SESSION_TTL_SECONDS: num(process.env.SESSION_TTL_SECONDS, 7 * 24 * 60 * 60),
  COOKIE_SECURE,
  COOKIE_SAMESITE,
  FRONTEND_ORIGIN_PATTERNS,
  SANDBOX_ID,
  PREVIEW_PORTS,
  TRUST_PROXY: bool(process.env.TRUST_PROXY, IS_PROD),
  BCRYPT_ROUNDS: num(process.env.BCRYPT_ROUNDS, IS_PROD ? 12 : 10),
  SESSION_COOKIE_NAME: 'sentra.sid',
  CSRF_COOKIE_NAME: 'sentra.csrf',
  CSRF_HEADER: 'x-csrf-token',
  MAX_RESULTS: 120,
  RADIUS_MIN_M: 500,
  RADIUS_MAX_M: 5000,
  RATE_LIMITS: {
    enabled: process.env.RATE_LIMIT_DISABLED !== '1',
    authMax: num(process.env.RATE_LIMIT_AUTH_MAX, 10),
    authWindowMs: num(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 15 * 60 * 1000),
    searchMax: num(process.env.RATE_LIMIT_SEARCH_MAX, 40),
    searchWindowMs: num(process.env.RATE_LIMIT_SEARCH_WINDOW_MS, 5 * 60 * 1000),
    apiMax: num(process.env.RATE_LIMIT_API_MAX, 600),
    apiWindowMs: num(process.env.RATE_LIMIT_API_WINDOW_MS, 15 * 60 * 1000)
  },
  CLIENT_DIST: path.join(PROJECT_ROOT, 'client', 'dist'),
  // Clickjacking protection for the HTML shell. JSON API responses always keep
  // helmet's strict `frame-ancestors 'none'`; the SPA needs to be framable by a
  // dev preview host, so it is configurable (and permissive over HTTPS in dev).
  FRAME_ANCESTORS: process.env.FRAME_ANCESTORS || (IS_PROD ? "'self'" : "'self' https:")
};

/** Exact origins allowed to call the API (CORS + CSRF origin check). */
export function allowedOrigins() {
  const origins = [...config.FRONTEND_ORIGIN, ...previewOrigins()];
  if (!config.IS_PROD) {
    origins.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173');
  }
  return Array.from(new Set(origins));
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternToRegex = (pattern) => new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);

/**
 * Single source of truth for "may this browser origin call the API?".
 * A missing Origin header (curl, tests, server-to-server, same-origin
 * navigation) is allowed: a cross-site page cannot suppress it.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  const value = normaliseOrigin(origin);
  if (allowedOrigins().includes(value)) return true;
  return config.FRONTEND_ORIGIN_PATTERNS.some((pattern) => patternToRegex(pattern).test(value));
}

/** Where the policy came from - used by the boot log and error messages. */
export function originPolicy() {
  return {
    allowed: allowedOrigins(),
    patterns: config.FRONTEND_ORIGIN_PATTERNS,
    derivedFrom: config.SANDBOX_ID ? `E2B_SANDBOX_ID=${config.SANDBOX_ID}` : null,
    previewPorts: config.PREVIEW_PORTS
  };
}
