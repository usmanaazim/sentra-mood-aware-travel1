/** Shared Express middleware: errors, auth guards, rate limiting, CSRF origin check. */
import rateLimit from 'express-rate-limit';
import { allowedOrigins, config, isAllowedOrigin } from './config.js';

/** Consistent JSON error envelope. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, 'bad_request', message, details);
export const unauthorized = (message = 'You need to sign in to do that.') => new ApiError(401, 'unauthorized', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'not_found', message);

/** Wrap async handlers so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function requireSession(req, _res, next) {
  if (req.session?.userId) return next();
  return next(unauthorized());
}

export function requireAuth(req, _res, next) {
  if (!req.session?.userId) {
    return next(unauthorized('Please sign in to continue.'));
  }
  // Sessions expire server-side as well as in the cookie.
  if (req.session.issuedAt && Date.now() - req.session.issuedAt > config.SESSION_TTL_SECONDS * 1000) {
    return req.session.destroy(() => next(unauthorized('Your session expired. Please sign in again.')));
  }
  return next();
}

const limiter = (opts) => rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  // Environment-driven so automated tests never trip the limiter.
  skip: () => !config.RATE_LIMITS.enabled,
  handler: (_req, res) => res.status(429).json({
    error: { code: 'rate_limited', message: 'Too many requests. Please slow down and try again shortly.' }
  }),
  ...opts
});

export const authLimiter = limiter({ windowMs: config.RATE_LIMITS.authWindowMs, limit: config.RATE_LIMITS.authMax });
export const searchLimiter = limiter({ windowMs: config.RATE_LIMITS.searchWindowMs, limit: config.RATE_LIMITS.searchMax });
export const apiLimiter = limiter({ windowMs: config.RATE_LIMITS.apiWindowMs, limit: config.RATE_LIMITS.apiMax });

// Set by createApp() to avoid a circular import with crypto helpers.
let verifyToken = () => false;
export function setCsrfVerifier(fn) { verifyToken = fn; }

/**
 * CSRF protection for cookie-based authentication.
 *  1. SameSite=Lax on the session cookie blocks cross-site form posts.
 *  2. Any state-changing request must carry an Origin header we trust (when a
 *     browser sends one) - mismatches are refused outright.
 *  3. The client must echo the signed double-submit token cookie in a header,
 *     which a cross-origin page cannot read.
 */
export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Same policy object as the CORS layer (config.isAllowedOrigin) - one rule.
  const origin = req.get('origin');
  if (!isAllowedOrigin(origin)) {
    return next(forbiddenOrigin(origin, { method: req.method, path: req.originalUrl }));
  }

  const cookieToken = req.cookies?.[config.CSRF_COOKIE_NAME];
  const sentToken = req.get(config.CSRF_HEADER);
  const ok = Boolean(cookieToken) && sentToken === cookieToken && verifyToken(sentToken);
  if (!ok) {
    return next(new ApiError(403, 'csrf_failed', 'Security token missing or invalid. Reload the page and try again.'));
  }
  return next();
}

/**
 * Actionable 403 for a request from a browser origin that is not on the
 * allow-list. The message names the rejected origin and how to allow it, so a
 * misconfigured deployment (e.g. a new preview host) is diagnosable instead of
 * surfacing as a generic failure.
 */
export function forbiddenOrigin(origin, { method = '', path = '' } = {}) {
  const policy = allowedOrigins();
  return new ApiError(
    403,
    'forbidden_origin',
    `This origin (${origin}) is not allowed to call the SENTRA API.`,
    {
      origin,
      request: method ? `${method} ${path}` : undefined,
      hint: 'Add the exact frontend origin to FRONTEND_ORIGIN in .env and restart the API. '
        + 'For hosted previews set PREVIEW_PORTS/PREVIEW_HOSTS, or rely on E2B_SANDBOX_ID, which derives '
        + '<port>-<sandboxId> preview origins automatically. Patterns can be opted into with FRONTEND_ORIGIN_PATTERNS.',
      allowedOrigins: policy,
      patterns: config.FRONTEND_ORIGIN_PATTERNS
    }
  );
}

/** Standard 404 for unknown API routes. */
export function apiNotFound(req, _res, next) {
  next(new ApiError(404, 'not_found', `No API route for ${req.method} ${req.path}.`));
}

/** Final error handler - never leaks stack traces in production. */
export function errorHandler(err, req, res, _next) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) {
    console.error(`[sentra] ${req.method} ${req.path} -> ${status}`, config.IS_PROD ? err.message : err);
  }
  const body = {
    error: {
      code: err.code || 'internal_error',
      message: status >= 500 && config.IS_PROD ? 'Something went wrong on the server.' : err.message || 'Unexpected error.',
      ...(err.details ? { details: err.details } : {})
    }
  };
  res.status(status).json(body);
}
