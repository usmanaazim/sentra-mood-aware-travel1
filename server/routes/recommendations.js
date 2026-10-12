/** POST /api/recommendations - the transparent mood-aware scoring pipeline. */
import express from 'express';
import { config } from '../config.js';
import { MOODS, MOOD_IDS, getMood } from '../mood.js';
import { clampRadius, setMoodInterpreter, validatePreferences } from '../validate.js';
import { interpretMoodText } from '../mood.js';
import { ApiError, asyncHandler, searchLimiter, unauthorized } from '../middleware.js';
import { nearbyPlaces } from '../overpass.js';
import { recommend } from '../recommend.js';
import { DEMO_META, DEMO_PLACES } from '../demoData.js';

// Wire the keyword interpreter into validate.js without a circular import.
setMoodInterpreter(interpretMoodText);

export function recommendationRoutes({ db, fetchImpl = fetch, placeCache } = {}) {
  const router = express.Router();

  const feedbackByKey = db.prepare('SELECT osm_key, vote, rating FROM feedback WHERE user_id = ?');

  router.post('/', searchLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const demoFlag = body.demo === true || String(body.demo) === 'true';

    // Live Overpass searches require an account (this also protects the public
    // community service from anonymous bulk use). Demo mode is deliberately open
    // so visitors can explore the interface - it never contacts Overpass.
    if (!demoFlag && !req.session?.userId) {
      throw unauthorized('Sign in to run live nearby searches, or switch on demo mode to try the interface.');
    }
    const parsed = validatePreferences(body);
    if (!parsed.ok) {
      throw new ApiError(400, 'validation_failed', 'Some preferences were invalid.', parsed.errors);
    }
    const prefs = parsed.value;
    prefs.radiusM = clampRadius(prefs.radiusM);

    const demoRequested = demoFlag;
    const mood = prefs.mood || prefs.moodSuggestion?.mood || null;

    // Personalisation input: the signed-in user's own stored feedback only.
    const feedbackMap = new Map();
    if (req.session?.userId) {
      for (const row of feedbackByKey.all(req.session.userId)) {
        feedbackMap.set(row.osm_key, { vote: row.vote, rating: row.rating });
      }
    }

    const scoreAndRespond = (places, sourceInfo) => {
      const engine = recommend({
        places,
        prefs: { ...prefs, mood, radiusM: prefs.radiusM },
        feedback: feedbackMap
      });
      const meta = {
        weights: engine.weights,
        mood: mood ? getMood(mood) : null,
        moodSuggestion: prefs.moodSuggestion || null,
        method:
          'Rule-based scoring: 50% mood/category compatibility + 30% distance suitability + 20% preference compatibility. ' +
          'No trained machine-learning model is used; scores are suitability indicators, not AI confidence values.',
        radiusM: prefs.radiusM,
        center: { lat: prefs.lat, lon: prefs.lon },
        excluded: engine.excluded,
        feedbackUsed: feedbackMap.size > 0,
        feedbackCount: feedbackMap.size,
        personalisation:
          feedbackMap.size > 0
            ? 'Your saved likes, dislikes and ratings adjusted the ranking of matching places (max ±12 points).'
            : 'No saved feedback yet - ranking uses the default algorithm.'
      };
      res.json({ ...sourceInfo, ...meta, count: engine.results.length, results: engine.results });
    };

    if (demoRequested) {
      return scoreAndRespond(DEMO_PLACES, {
        demo: true,
        source: 'demo',
        demoNotice: DEMO_META.label,
        note: 'Illustrative sample records - NOT live recommendation results.',
        attribution: 'Sample records generated for SENTRA demo mode.'
      });
    }

    try {
      const { places, fetchedAt, cached, droppedCount } = await nearbyPlaces({
        lat: prefs.lat,
        lon: prefs.lon,
        radiusM: prefs.radiusM,
        categories: prefs.categories.length ? prefs.categories : [],
        fetchImpl,
        cache: placeCache
      });
      scoreAndRespond(places, {
        demo: false,
        source: 'overpass',
        fetchedAt,
        cached: Boolean(cached),
        droppedUnusable: droppedCount,
        attribution: '© OpenStreetMap contributors'
      });
    } catch (err) {
      const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 502;
      res.status(status).json({
        error: {
          code: err?.kind || 'upstream_error',
          message: err?.message || 'Could not retrieve nearby places right now.',
          retryable: true,
          demoAvailable: true,
          hint: 'Retry, or enable demo mode to see clearly labelled illustrative results.'
        }
      });
    }
  }));

  router.get('/meta', (_req, res) => {
    res.json({
      moods: MOODS.map(({ id, label, emoji, blurb }) => ({ id, label, emoji, blurb })),
      weights: { mood: 0.5, distance: 0.3, preferences: 0.2 },
      radiusRangeM: [config.RADIUS_MIN_M, config.RADIUS_MAX_M],
      method: 'Transparent rule-based scoring in plain JavaScript (no trained AI model).'
    });
  });

  router.get('/moods', (_req, res) => res.json({ moods: MOOD_IDS }));
  return router;
}
