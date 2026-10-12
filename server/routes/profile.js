/** Profile + preferences. Users can only ever read or write their own row. */
import express from 'express';
import { CATEGORY_IDS } from '../mood.js';
import { clampRadius, validatePreferences } from '../validate.js';
import { ApiError, asyncHandler, requireAuth } from '../middleware.js';

export function profileRoutes({ db }) {
  const router = express.Router();

  const getPrefs = db.prepare('SELECT * FROM preferences WHERE user_id = ?');
  const upsertPrefs = db.prepare(
    `INSERT INTO preferences (user_id, mood, categories, budget_inr, time_minutes, radius_m, indoor_outdoor, purpose, accessibility, updated_at)
     VALUES (@userId, @mood, @categories, @budgetInr, @timeMinutes, @radiusM, @indoorOutdoor, @purpose, @accessibility, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       mood = excluded.mood,
       categories = excluded.categories,
       budget_inr = excluded.budget_inr,
       time_minutes = excluded.time_minutes,
       radius_m = excluded.radius_m,
       indoor_outdoor = excluded.indoor_outdoor,
       purpose = excluded.purpose,
       accessibility = excluded.accessibility,
       updated_at = datetime('now')`
  );
  const userRow = db.prepare('SELECT id, name, email, created_at AS createdAt FROM users WHERE id = ?');
  const feedbackStats = db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN vote = 'like' THEN 1 ELSE 0 END) AS likes,
            SUM(CASE WHEN vote = 'dislike' THEN 1 ELSE 0 END) AS dislikes,
            AVG(rating) AS avgRating
     FROM feedback WHERE user_id = ?`
  );
  const recentFeedback = db.prepare(
    `SELECT id, osm_key AS osmKey, name, category, vote, rating, comment, updated_at AS updatedAt
     FROM feedback WHERE user_id = ? ORDER BY datetime(updated_at) DESC LIMIT 20`
  );

  const shapePrefs = (row) => row ? {
    mood: row.mood || null,
    categories: safeJsonArray(row.categories),
    budgetInr: row.budget_inr ?? null,
    timeMinutes: row.time_minutes ?? null,
    radiusM: row.radius_m ?? 3000,
    indoorOutdoor: row.indoor_outdoor || 'any',
    purpose: row.purpose || '',
    accessibility: row.accessibility || '',
    updatedAt: row.updated_at || null,
    storesPreciseLocation: false
  } : {
    mood: null, categories: [], budgetInr: null, timeMinutes: null, radiusM: 3000,
    indoorOutdoor: 'any', purpose: '', accessibility: '', updatedAt: null, storesPreciseLocation: false
  };

  router.get('/', requireAuth, (req, res) => {
    const user = userRow.get(req.session.userId);
    if (!user) throw new ApiError(404, 'not_found', 'Account not found.');
    const stats = feedbackStats.get(req.session.userId);
    res.set('Cache-Control', 'no-store');
    res.json({
      user,
      preferences: shapePrefs(getPrefs.get(req.session.userId)),
      feedback: {
        total: stats.total || 0,
        likes: stats.likes || 0,
        dislikes: stats.dislikes || 0,
        averageRating: stats.avgRating ? Math.round(stats.avgRating * 10) / 10 : null,
        recent: recentFeedback.all(req.session.userId)
      },
      availableCategories: CATEGORY_IDS,
      note: 'SENTRA stores your preferences and feedback only. Precise coordinates are not persisted.'
    });
  });

  router.put('/preferences', requireAuth, asyncHandler(async (req, res) => {
    // Coordinates are not required (and never stored) when saving preferences.
    const parsed = validatePreferences(req.body || {}, { requireLocation: false });
    if (!parsed.ok) {
      throw new ApiError(400, 'validation_failed', 'Some preference values were invalid.', parsed.errors);
    }
    const p = parsed.value;
    // Note: lat/lon are intentionally NOT persisted - only used for live searches.
    upsertPrefs.run({
      userId: req.session.userId,
      mood: p.mood,
      categories: JSON.stringify(p.categories || []),
      budgetInr: p.budgetInr,
      timeMinutes: p.timeMinutes,
      radiusM: clampRadius(p.radiusM),
      indoorOutdoor: p.indoorOutdoor,
      purpose: p.purpose || null,
      accessibility: p.accessibility || null
    });
    res.json({
      preferences: shapePrefs(getPrefs.get(req.session.userId)),
      message: 'Preferences saved.',
      ...(p.radiusClampedFrom ? { notice: `Radius was adjusted to the supported range (${p.radiusM} m).` } : {})
    });
  }));

  return router;
}

function safeJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => CATEGORY_IDS.includes(v)) : [];
  } catch {
    return [];
  }
}
