/** Feedback: persist likes/dislikes/ratings/comments and feed them into ranking. */
import express from 'express';
import { LIMITS, validateFeedback } from '../validate.js';
import { ApiError, asyncHandler, requireAuth } from '../middleware.js';

export function feedbackRoutes({ db }) {
  const router = express.Router();

  const listMine = db.prepare(
    `SELECT id, osm_key AS osmKey, name, category, vote, rating, comment, created_at AS createdAt, updated_at AS updatedAt
     FROM feedback WHERE user_id = ? ORDER BY datetime(updated_at) DESC LIMIT 200`
  );
  const countMine = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id = ?');
  const upsert = db.prepare(
    `INSERT INTO feedback (user_id, osm_key, name, category, vote, rating, comment)
     VALUES (@userId, @osmKey, @name, @category, @vote, @rating, @comment)
     ON CONFLICT(user_id, osm_key) DO UPDATE SET
       name       = excluded.name,
       category   = excluded.category,
       vote       = excluded.vote,
       rating     = excluded.rating,
       comment    = excluded.comment,
       updated_at = datetime('now')`
  );
  const findOwn = db.prepare('SELECT id, user_id AS userId FROM feedback WHERE id = ?');
  const deleteOwn = db.prepare('DELETE FROM feedback WHERE id = ? AND user_id = ?');

  router.get('/', requireAuth, (req, res) => {
    const rows = listMine.all(req.session.userId);
    res.set('Cache-Control', 'no-store');
    res.json({
      count: rows.length,
      limit: 200,
      feedback: rows,
      rankingEffect:
        'Stored votes and ratings adjust your own future rankings: likes +6 points, dislikes -10 points, ' +
        'and rating deviations from 3 out of 5 shift the score by up to ±4 points.'
    });
  });

  router.post('/', requireAuth, (req, res, next) => {
    try {
      const parsed = validateFeedback(req.body || {});
      if (!parsed.ok) {
        throw new ApiError(400, 'validation_failed', 'Feedback could not be saved.', parsed.errors);
      }
      const { osmKey, name, category, vote, rating, comment } = parsed.value;
      const userId = req.session.userId;

      const existing = countMine.get(userId).n;
      const previous = db.prepare('SELECT id FROM feedback WHERE user_id = ? AND osm_key = ?').get(userId, osmKey);
      if (!previous && existing >= LIMITS.FEEDBACK_MAX_RECORDS) {
        throw new ApiError(429, 'feedback_limit_reached', `You have reached the ${LIMITS.FEEDBACK_MAX_RECORDS}-record feedback limit. Delete an older entry first.`);
      }

      upsert.run({ userId, osmKey, name: name || null, category: category || null, vote, rating, comment: comment || null });
      const saved = db.prepare(
        `SELECT id, osm_key AS osmKey, name, category, vote, rating, comment, created_at AS createdAt, updated_at AS updatedAt
         FROM feedback WHERE user_id = ? AND osm_key = ?`
      ).get(userId, osmKey);

      res.status(previous ? 200 : 201).json({
        feedback: saved,
        message: previous ? 'Feedback updated.' : 'Thanks - your feedback was saved.',
        rankingEffect: previous ? 'Updated values are used the next time you request recommendations.' : undefined
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'Feedback id must be a positive whole number.' } });
    }
    const owned = findOwn.get(id);
    if (!owned || owned.userId !== req.session.userId) {
      return res.status(404).json({ error: { code: 'not_found', message: 'That feedback entry does not exist for your account.' } });
    }
    deleteOwn.run(id, req.session.userId);
    return res.status(204).end();
  });

  return router;
}
