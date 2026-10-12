/** Nearby-place search backed by Overpass / OpenStreetMap. */
import express from 'express';
import { config } from '../config.js';
import { CATEGORY_IDS, CATEGORIES } from '../mood.js';
import { clampRadius, validateCoords } from '../validate.js';
import { ApiError, asyncHandler, searchLimiter } from '../middleware.js';
import { OVERPASS_ERRORS, nearbyPlaces } from '../overpass.js';
import { haversineMeters } from '../recommend.js';
import { DEMO_META, DEMO_PLACES } from '../demoData.js';

export function placeRoutes({ fetchImpl = fetch, placeCache } = {}) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      overpassUrl: config.OVERPASS_URL,
      upstream: 'public Overpass API (community operated, no uptime guarantee)',
      cacheTtlMs: config.PLACES_CACHE_TTL_MS,
      supportedCategories: CATEGORY_IDS,
      note: 'Availability depends on the public Overpass service.'
    });
  });

  router.get('/nearby', searchLimiter, asyncHandler(async (req, res) => {
    const { lat, lon, radius, categories, demo } = req.query;

    // Demo mode is explicit and never silently substituted for live data.
    const demoRequested = String(demo || '').toLowerCase() === 'true' || String(demo) === '1';

    const coords = validateCoords(lat, lon);
    if (!coords.ok) {
      throw new ApiError(400, 'invalid_coordinates', 'Latitude and longitude are required and must be valid.', coords.errors);
    }
    const radiusM = clampRadius(radius);

    let selected = [];
    if (categories) {
      selected = String(categories).split(',').map((c) => c.trim()).filter(Boolean);
      const unknown = selected.filter((c) => !CATEGORY_IDS.includes(c));
      if (unknown.length) {
        throw new ApiError(400, 'invalid_categories', `Unknown categories: ${unknown.join(', ')}`, [`Supported: ${CATEGORY_IDS.join(', ')}`]);
      }
    }

    res.set('Cache-Control', 'no-store');

    if (demoRequested) {
      return res.json({
        demo: true,
        source: 'demo',
        demoNotice: DEMO_META.label,
        count: DEMO_PLACES.length,
        radiusM,
        center: { lat: coords.value.lat, lon: coords.value.lon },
        places: DEMO_PLACES,
        note: 'Illustrative sample records - NOT live OpenStreetMap results.',
        attribution: 'Sample records generated for SENTRA demo mode.'
      });
    }

    try {
      const { places, fetchedAt, cached, droppedCount } = await nearbyPlaces({
        lat: coords.value.lat,
        lon: coords.value.lon,
        radiusM,
        categories: selected,
        fetchImpl,
        cache: placeCache
      });

      // The Overpass bounding box is an approximation: measure real distances and
      // drop anything outside the requested radius.
      const origin = { lat: coords.value.lat, lon: coords.value.lon };
      const withDistance = places
        .map((p) => ({ ...p, distanceM: Math.round(haversineMeters(origin, p)) }))
        .filter((p) => Number.isFinite(p.distanceM) && p.distanceM <= radiusM)
        .sort((a, b) => a.distanceM - b.distanceM);

      res.json({
        demo: false,
        source: 'overpass',
        count: withDistance.length,
        radiusM,
        center: { lat: coords.value.lat, lon: coords.value.lon },
        cached: Boolean(cached),
        fetchedAt,
        droppedUnusable: droppedCount,
        droppedOutsideRadius: places.length - withDistance.length,
        places: withDistance,
        attribution: '© OpenStreetMap contributors',
        note: withDistance.length === 0
          ? 'No matching places in OpenStreetMap for this area and radius. Try a larger radius or different categories.'
          : 'Live OpenStreetMap data via the public Overpass API.'
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const kind = err?.kind || OVERPASS_ERRORS.UPSTREAM_ERROR;
      const status = err?.status || 502;
      // Tell the client exactly what happened and that demo mode is available.
      res.status(status >= 400 && status < 600 ? status : 502).json({
        error: {
          code: kind,
          message: err.message || 'The nearby-place search service is unavailable right now.',
          retryable: true,
          demoAvailable: true,
          hint: 'You can retry, or switch on explicitly labelled demo mode to explore the interface.'
        }
      });
    }
  }));

  router.get('/categories', (_req, res) => {
    res.json({
      categories: CATEGORY_IDS.map((id) => ({ id, label: CATEGORIES[id].label, osm: CATEGORIES[id].osm }))
    });
  });

  return router;
}
