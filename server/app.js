/**
 * Express application factory. Kept separate from server.js so automated tests
 * can exercise the real HTTP surface without binding a fixed port.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isAllowedOrigin, allowedOrigins, config } from './config.js';
import { closeDb, createDb, healthCheck } from './db.js';
import { createSessionStore } from './sessionStore.js';
import { createPlaceCache } from './overpass.js';
import { forbiddenOrigin, apiLimiter, apiNotFound, csrfProtection, errorHandler, setCsrfVerifier } from './middleware.js';
import { authRoutes } from './routes/auth.js';
import { placeRoutes } from './routes/places.js';
import { recommendationRoutes } from './routes/recommendations.js';
import { feedbackRoutes } from './routes/feedback.js';
import { profileRoutes } from './routes/profile.js';

/** Double-submit CSRF token: <random>.<hmac>. Verified without server state. */
export function issueCsrfToken() {
  const raw = crypto.randomBytes(24).toString('hex');
  const sig = crypto.createHmac('sha256', config.SESSION_SECRET).update(raw).digest('hex').slice(0, 32);
  return `${raw}.${sig}`;
}

export function verifyCsrfToken(token) {
  if (typeof token !== 'string' || token.length < 40 || !token.includes('.')) return false;
  const [raw, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', config.SESSION_SECRET).update(raw).digest('hex').slice(0, 32);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function createApp({ dbPath = config.DATABASE_PATH, fetchImpl = fetch } = {}) {
  setCsrfVerifier(verifyCsrfToken);
  const db = createDb(dbPath);
  const app = express();
  const sessionStore = createSessionStore(db, { ttlMs: config.SESSION_TTL_SECONDS * 1000 });
  const placeCache = createPlaceCache();

  // ------------------------------ security ---------------------------------
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet({
    // The SPA is served by Vite in dev and by this server (or a static host) in
    // production; allow the FOSSGIS OSM tile host (client/src/components/
    // SentraMap.jsx explains why the OSM Foundation's own tile host is not
    // used) and inline styles for Leaflet.
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.de'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'"],
        'connect-src': ["'self'", ...allowedOrigins()],
        'font-src': ["'self'", 'data:'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));

  app.use(cors({
    origin(origin, cb) {
      // Same rule as the CSRF origin check (config.isAllowedOrigin): the exact
      // allow-list first, then any explicitly configured glob pattern.
      if (isAllowedOrigin(origin)) return cb(null, true);
      // Reject with an explicit JSON error instead of silently omitting the CORS
      // headers, so an unlisted preview host is diagnosable. Credentials never
      // combine with a wildcard: the allowed origin is echoed verbatim.
      return cb(forbiddenOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', config.CSRF_HEADER],
    maxAge: 600
  }));

  // Small JSON bodies only - request-size limit.
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  app.use(session({
    name: config.SESSION_COOKIE_NAME,
    secret: config.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,                       // never readable from JavaScript
      sameSite: config.COOKIE_SAMESITE,     // 'lax' by default: blocks cross-site POST CSRF
      secure: config.COOKIE_SECURE,         // HTTPS-only in production (implied by SameSite=None)
      maxAge: config.SESSION_TTL_SECONDS * 1000,
      path: '/'
    }
  }));

  // Issue a signed double-submit CSRF token cookie. Readable by JavaScript on
  // purpose (the client echoes it in a header); it is not a credential on its own.
  app.use((req, res, next) => {
    if (!req.cookies?.[config.CSRF_COOKIE_NAME]) {
      res.cookie(config.CSRF_COOKIE_NAME, issueCsrfToken(), {
        httpOnly: false,                     // the client must echo it in a header
        sameSite: config.COOKIE_SAMESITE,
        secure: config.COOKIE_SECURE,
        path: '/',
        maxAge: config.SESSION_TTL_SECONDS * 1000
      });
    }
    next();
  });

  app.use('/api', apiLimiter);
  app.use('/api', csrfProtection);

  app.get('/api/health', (_req, res) => {
    const dbHealth = healthCheck(db);
    res.status(dbHealth.ok ? 200 : 503).json({
      status: dbHealth.ok ? 'ok' : 'degraded',
      service: 'sentra-api',
      version: '1.0.0',
      environment: config.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      database: dbHealth.ok ? 'connected' : 'unavailable',
      overpassEndpoint: config.OVERPASS_URL,
      time: new Date().toISOString()
    });
  });

  app.use('/api/auth', authRoutes({ db, sessionStore }));
  app.use('/api/places', placeRoutes({ fetchImpl, placeCache }));
  app.use('/api/recommendations', recommendationRoutes({ db, fetchImpl, placeCache }));
  app.use('/api/feedback', feedbackRoutes({ db }));
  app.use('/api/profile', profileRoutes({ db }));

  app.use('/api', apiNotFound);

  // -------------------------------- static ---------------------------------
  /**
   * The HTML shell gets a framable CSP (so dev preview hosts and same-origin
   * embeds work) while every /api response keeps helmet's strict defaults.
   * Configure with FRAME_ANCESTORS, e.g. FRAME_ANCESTORS="'self' https://*.example.com".
   */
  const spaHeaders = (_req, res, next) => {
    res.removeHeader('X-Frame-Options');
    const csp = res.getHeader('Content-Security-Policy');
    if (csp) {
      res.setHeader('Content-Security-Policy', String(csp).replace(/frame-ancestors[^;]*/, `frame-ancestors ${config.FRAME_ANCESTORS}`));
    }
    next();
  };

  // In production, serve the built SPA from the same origin so cookies are
  // first-party and no CORS is required at all.
  if (fs.existsSync(config.CLIENT_DIST)) {
    app.use(express.static(config.CLIENT_DIST, { index: false, maxAge: '1h', setHeaders: (res) => res.removeHeader('X-Frame-Options') }));
    app.get(/^(?!\/api).*/, spaHeaders, (_req, res) => res.sendFile(path.join(config.CLIENT_DIST, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.json({
      service: 'SENTRA API',
      message: 'API is running. Start the frontend with: npm run dev:client',
      docs: 'See README.md for the endpoint list.'
    }));
  }

  app.use(errorHandler);
  app.locals.db = db;
  app.locals.sessionStore = sessionStore;
  // Close this app's own handle (and the process-wide singleton if present).
  app.close = () => {
    try { db.close(); } catch { /* already closed */ }
    closeDb();
  };
  return app;
}
