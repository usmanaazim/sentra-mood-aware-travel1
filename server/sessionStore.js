/**
 * Minimal, well-understood SQLite session store for express-session.
 * Sessions live server-side only; the browser holds an opaque signed session id
 * in an HTTP-only cookie. Sessions are never written to localStorage.
 */
import session from 'express-session';

export function createSessionStore(db, { ttlMs = 7 * 24 * 60 * 60 * 1000, sweepIntervalMs = 15 * 60 * 1000 } = {}) {
  const statements = {
    get: db.prepare('SELECT sess, expires_at FROM sessions WHERE sid = ?'),
    upsert: db.prepare(
      `INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at`
    ),
    del: db.prepare('DELETE FROM sessions WHERE sid = ?'),
    sweep: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM sessions')
  };

  const store = new session.Store();
  store.ttl = ttlMs;

  store.get = (sid, cb) => {
    try {
      const row = statements.get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires_at <= Date.now()) {
        statements.del.run(sid);
        return cb(null, null);
      }
      return cb(null, JSON.parse(row.sess));
    } catch (err) {
      return cb(err);
    }
  };

  store.set = (sid, sess, cb) => {
    try {
      const expires = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + ttlMs;
      statements.upsert.run(sid, JSON.stringify(sess), expires);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  };

  store.destroy = (sid, cb) => {
    try {
      statements.del.run(sid);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  };

  store.touch = (sid, sess, cb) => store.set(sid, sess, cb);

  store.length = (cb) => {
    try { cb(null, statements.count.get().n); } catch (err) { cb(err); }
  };

  store.clear = (cb) => {
    try { db.prepare('DELETE FROM sessions').run(); if (cb) cb(null); } catch (err) { if (cb) cb(err); }
  };

  const sweep = setInterval(() => {
    try { statements.sweep.run(Date.now()); } catch { /* non-fatal */ }
  }, sweepIntervalMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  return store;
}
