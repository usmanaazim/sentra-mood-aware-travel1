/**
 * Tiny fetch wrapper for the SENTRA API.
 *  - always sends cookies (session auth lives in an HTTP-only cookie)
 *  - echoes the double-submit CSRF token cookie in a header
 *  - normalises errors so the UI can show something readable and actionable
 * No credentials or tokens are ever written to localStorage.
 */
const CONFIGURED_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const LOOPBACK_BASE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/**
 * Resolves the API base URL.
 *
 * A build configured with VITE_API_BASE_URL=http://localhost:4000 is correct on
 * the developer's machine but wrong the moment the same page is opened from a
 * hosted preview: "localhost" would then mean the *visitor's* own computer. In
 * that case fall back to relative /api requests, which is how SENTRA is meant to
 * run (the Vite dev server proxies /api, and production serves the SPA and the
 * API from one origin).
 */
function resolveBase() {
  if (!CONFIGURED_BASE) return '';
  if (typeof window === 'undefined' || !window.location) return CONFIGURED_BASE;
  const { protocol, hostname } = window.location;
  const pageIsLocal = protocol === 'file:' || LOOPBACK_HOST.test(hostname);
  if (LOOPBACK_BASE.test(CONFIGURED_BASE) && !pageIsLocal) {
    console.warn(
      `[sentra] VITE_API_BASE_URL is ${CONFIGURED_BASE} but this page is served from ${window.location.origin}; ` +
      'localhost would point at the visitor\'s machine, so same-origin /api requests are used instead.'
    );
    return '';
  }
  return CONFIGURED_BASE;
}

const BASE = resolveBase();
const CSRF_COOKIE = 'sentra.csrf';
const CSRF_HEADER = 'x-csrf-token';

export class ApiError extends Error {
  constructor(status, code, message, details, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details || [];
    this.payload = payload || null;
  }
  get isAuth() { return this.status === 401; }
  get isRateLimit() { return this.status === 429; }
  get isOffline() { return this.code === 'network_error'; }
}

export function readCookie(name) {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export const apiUrl = (path) => `${BASE}${path}`;

export async function apiFetch(path, { method = 'GET', body, signal, timeoutMs = 30000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const csrf = readCookie(CSRF_COOKIE);
  if (csrf) headers[CSRF_HEADER] = csrf;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'The request took too long. Please check your connection and try again.');
    }
    const where = BASE || (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    throw new ApiError(0, 'network_error', `Could not reach the SENTRA API (${where}). Is the backend running?`);
  }
  clearTimeout(timer);

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }

  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || 'error', err.message || `Request failed (${res.status}).`, err.details, data);
  }
  return data;
}

export const api = {
  me: () => apiFetch('/api/auth/me'),
  register: (payload) => apiFetch('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => apiFetch('/api/auth/login', { method: 'POST', body: payload }),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST', body: {} }),
  health: () => apiFetch('/api/health', { timeoutMs: 6000 }),
  placeHealth: () => apiFetch('/api/places/health', { timeoutMs: 8000 }),
  nearby: (params, opts = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/places/nearby?${q}`, opts);
  },
  recommend: (payload) => apiFetch('/api/recommendations', { method: 'POST', body: payload, timeoutMs: 35000 }),
  profile: () => apiFetch('/api/profile'),
  savePreferences: (payload) => apiFetch('/api/profile/preferences', { method: 'PUT', body: payload }),
  feedback: () => apiFetch('/api/feedback'),
  saveFeedback: (payload) => apiFetch('/api/feedback', { method: 'POST', body: payload }),
  deleteFeedback: (id) => apiFetch(`/api/feedback/${id}`, { method: 'DELETE' })
};
