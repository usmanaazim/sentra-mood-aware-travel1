/** Authentication routes: register, login, logout, session status. */
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { validateLogin, validateRegister } from '../validate.js';
import { ApiError, asyncHandler, authLimiter, requireSession } from '../middleware.js';

const publicUser = (row) => row && ({ id: row.id, name: row.name, email: row.email, createdAt: row.created_at });

export function authRoutes({ db, sessionStore }) {
  const router = express.Router();

  const findUserByEmail = db.prepare('SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?');
  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  const insertPreferences = db.prepare('INSERT OR IGNORE INTO preferences (user_id) VALUES (?)');
  const getUserById = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?');

  /** Regenerate the session after authentication (session-fixation defence). */
  const regenerate = (req) => new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  const saveSession = (req) => new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  router.post('/register', authLimiter, asyncHandler(async (req, res) => {
    const parsed = validateRegister(req.body || {});
    if (!parsed.ok) {
      throw new ApiError(400, 'validation_failed', 'Please check the highlighted fields.', parsed.errors);
    }
    const { name, email, password } = parsed.value;

    const existing = findUserByEmail.get(email);
    // Do not disclose whether an arbitrary email is registered: treat a duplicate
    // like any other validation problem but keep the message neutral.
    if (existing) {
      throw new ApiError(409, 'registration_failed', 'That email cannot be used to create an account. Try signing in instead.', [
        'If this is your email, sign in. Otherwise use a different address.'
      ]);
    }

    const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    let userId;
    try {
      const info = insertUser.run(name, email, passwordHash);
      userId = Number(info.lastInsertRowid);
      insertPreferences.run(userId);
    } catch (err) {
      // Unique constraint race between the check above and the insert.
      if (String(err.message).includes('UNIQUE')) {
        throw new ApiError(409, 'registration_failed', 'That email cannot be used to create an account.', []);
      }
      throw err;
    }

    await regenerate(req);
    req.session.userId = userId;
    req.session.issuedAt = Date.now();
    await saveSession(req);
    const user = getUserById.get(userId);
    res.status(201).json({ user: publicUser(user) });
  }));

  router.post('/login', authLimiter, asyncHandler(async (req, res) => {
    const parsed = validateLogin(req.body || {});
    if (!parsed.ok) {
      throw new ApiError(400, 'validation_failed', 'Please check your email and password.', parsed.errors);
    }
    const { email, password } = parsed.value;
    const row = findUserByEmail.get(email);
    // Compare against a dummy hash when the user does not exist so response time
    // does not reveal account existence, then return the same generic error.
    const hash = row?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(password, hash).catch(() => false);
    if (!row || !ok) {
      throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
    }

    await regenerate(req);
    req.session.userId = row.id;
    req.session.issuedAt = Date.now();
    await saveSession(req);
    res.json({ user: publicUser(row) });
  }));

  router.post('/logout', (req, res, next) => {
    if (!req.session) return res.status(204).end();
    const sid = req.sessionID;
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(config.SESSION_COOKIE_NAME, { path: '/' });
      res.clearCookie(config.CSRF_COOKIE_NAME, { path: '/' });
      // Belt and braces: make sure the server-side record is gone.
      try { sessionStore?.destroy?.(sid, () => {}); } catch { /* ignore */ }
      res.status(204).end();
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session?.userId) {
      return res.status(200).json({ user: null });
    }
    const user = getUserById.get(req.session.userId);
    if (!user) {
      // User deleted but cookie still present.
      return req.session.destroy(() => res.status(200).json({ user: null }));
    }
    res.json({
      user: publicUser(user),
      sessionExpiresAt: req.session.issuedAt ? new Date(req.session.issuedAt + config.SESSION_TTL_SECONDS * 1000).toISOString() : null
    });
  });

  // Kept exported for potential future password flows without adding dead endpoints.
  void crypto;
  return router;
}
