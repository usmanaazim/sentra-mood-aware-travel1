/**
 * SENTRA recommendation engine.
 *
 * This is a transparent, rule-based scoring pipeline written in plain
 * JavaScript. There is NO trained machine-learning model involved, and the
 * output is a suitability score out of 100 - not an AI confidence percentage.
 *
 * Final score = 50% mood/category compatibility
 *             + 30% distance suitability
 *             + 20% preference compatibility
 * All components are normalised to 0-100 before weighting.
 */
import { CATEGORY_IDS, categoryLabel, getMood, moodScore } from './mood.js';

export const WEIGHTS = { mood: 0.5, distance: 0.3, preferences: 0.2 };

const EARTH_RADIUS_M = 6371008.8;

export const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two {lat, lon} points, in metres. */
export function haversineMeters(a, b) {
  if (!a || !b) return NaN;
  const lat1 = Number(a.lat); const lon1 = Number(a.lon);
  const lat2 = Number(b.lat); const lon2 = Number(b.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance suitability: 100 at the user's position, falling smoothly to 0 at the
 * search radius. Subtracts a small travel-time allowance from the available time
 * when the user supplied one.
 */
export function distanceScore(distanceM, radiusM) {
  if (!Number.isFinite(distanceM) || !Number.isFinite(radiusM) || radiusM <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, distanceM / radiusM));
  return Math.round(100 * (1 - Math.pow(ratio, 1.6)));
}

/** Estimated travel time in minutes at mixed walking / short-ride pace. */
export function travelMinutes(distanceM) {
  if (!Number.isFinite(distanceM)) return null;
  const speedMps = distanceM <= 1200 ? 1.25 : 6.5; // walk short hops, ride further out
  return Math.max(1, Math.round(distanceM / speedMps / 60));
}

const OUTDOOR_CATEGORIES = ['park', 'garden', 'playground', 'water_park', 'viewpoint', 'nature_reserve'];
const INDOOR_CATEGORIES = ['cafe', 'restaurant', 'museum'];

/**
 * Preference compatibility (0-100) built ONLY from known metadata plus explicit
 * user selections. Unknown data never invents a value - it simply contributes a
 * neutral sub-score.
 */
export function preferenceScore(place, prefs = {}) {
  const parts = []; // { key, score, note }

  // 1. Category interests (only when the user selected any).
  if (Array.isArray(prefs.categories) && prefs.categories.length) {
    const preferred = prefs.categories.includes(place.category);
    parts.push({ key: 'category', score: preferred ? 100 : 35, note: preferred ? 'matches one of your preferred categories' : null });
  }

  // 2. Indoor / outdoor preference, derived from the OSM category plus real tags.
  if (prefs.indoorOutdoor === 'outdoor' || prefs.indoorOutdoor === 'indoor') {
    let score = 55;
    const isOutdoor = OUTDOOR_CATEGORIES.includes(place.category);
    const isIndoor = INDOOR_CATEGORIES.includes(place.category);
    if (place.category === 'attraction') score = 60; // attractions are frequently mixed
    if (prefs.indoorOutdoor === 'outdoor' && isOutdoor) score = 100;
    if (prefs.indoorOutdoor === 'indoor' && isIndoor) score = 100;
    if (prefs.indoorOutdoor === 'outdoor' && isIndoor) score = 35;
    if (prefs.indoorOutdoor === 'indoor' && isOutdoor) score = 30;
    parts.push({ key: 'indoorOutdoor', score, note: score >= 90 ? 'fits your indoor/outdoor preference' : null });
  }

  // 3. Budget, ONLY where a fee is explicitly tagged in OpenStreetMap.
  if (Number.isFinite(prefs.budgetInr)) {
    if (place.fee === 'no') {
      parts.push({ key: 'budget', score: 100, note: 'no entrance fee tagged in OpenStreetMap' });
    } else if (place.fee === 'yes') {
      // OSM records that a fee exists but rarely how much - never invent an amount.
      const generous = prefs.budgetInr >= 500;
      parts.push({ key: 'budget', score: generous ? 65 : 40, note: 'an entrance fee is tagged (amount unknown)' });
    } else {
      parts.push({ key: 'budget', score: 60, note: null });
    }
  }

  // 4. Accessibility, only from the wheelchair tag.
  if (prefs.accessibility && /wheel|step|accessible|mobility/i.test(prefs.accessibility)) {
    if (place.wheelchair === 'yes') parts.push({ key: 'accessibility', score: 100, note: 'wheelchair access tagged as available' });
    else if (place.wheelchair === 'limited') parts.push({ key: 'accessibility', score: 70, note: null });
    else if (place.wheelchair === 'no') parts.push({ key: 'accessibility', score: 25, note: null });
    else parts.push({ key: 'accessibility', score: 55, note: null }); // unknown - stay neutral
  }

  if (!parts.length) return { score: 70, notes: [], breakdown: [] };
  const score = Math.round(parts.reduce((sum, p) => sum + p.score, 0) / parts.length);
  return { score, notes: parts.map((p) => p.note).filter(Boolean), breakdown: parts.map(({ key, score: s }) => ({ key, score: s })) };
}

/**
 * Time suitability, applied ONLY when both an available time and a known visit
 * duration exist. OpenStreetMap almost never records visit duration, so this is
 * usually a neutral 70 and never blocks a place.
 */
function timeComponent(place, prefs, travel) {
  const available = Number.isFinite(prefs.timeMinutes) ? prefs.timeMinutes : null;
  const visit = Number.isFinite(place.typicalVisitMinutes) ? place.typicalVisitMinutes : null;
  if (available === null) return { score: 70, note: null, applied: false };
  const tripMinutes = (travel ?? 0) * 2 + (visit ?? 0);
  if (visit === null) {
    return { score: 70, note: null, applied: false }; // duration unknown -> stays neutral
  }
  if (tripMinutes <= available) {
    return { score: 100, note: `estimated round trip of ${tripMinutes} min fits your ${available} min`, applied: true };
  }
  return { score: 40, note: `estimated round trip of ${tripMinutes} min is longer than your ${available} min`, applied: true };
}

function distanceBand(distanceM, radiusM) {
  if (!Number.isFinite(distanceM)) return 'unknown distance';
  if (distanceM <= radiusM * 0.25) return 'very close by';
  if (distanceM <= radiusM * 0.6) return 'nearby';
  return 'within your search radius';
}

function moodReason(moodId, category, band, place) {
  const mood = getMood(moodId);
  const cat = categoryLabel(category).toLowerCase();
  const why = [];
  if (mood) {
    if (band === 'primary') why.push(`it is a strong match for feeling ${mood.label.toLowerCase()}`);
    else if (band === 'secondary') why.push(`it fits your ${mood.label.toLowerCase()} mood`);
    else why.push(`it is a ${cat} near you`);
  } else {
    why.push(`it is a ${cat} near you`);
  }
  return why.join(' and ');
}

/**
 * Rank places for a set of preferences.
 * @param {object} args
 * @param {Array} args.places   normalised places (with distanceM already set or computed here)
 * @param {object} args.prefs    validated preferences
 * @param {Map|object} [args.feedback]  aggregated user feedback keyed by osmKey
 */
export function recommend({ places = [], prefs = {}, feedback = null } = {}) {
  const radiusM = Number.isFinite(prefs.radiusM) ? prefs.radiusM : 3000;
  const origin = { lat: prefs.lat, lon: prefs.lon };
  const feedbackGet = feedback instanceof Map ? (k) => feedback.get(k) : (k) => (feedback ? feedback[k] : undefined);
  const mood = prefs.mood || null;

  const scored = [];
  const excluded = { outsideRadius: 0, invalid: 0, noMatch: 0 };

  for (const place of places) {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) { excluded.invalid += 1; continue; }

    const distanceM = Number.isFinite(place.distanceM) ? place.distanceM : haversineMeters(origin, place);
    if (!Number.isFinite(distanceM)) { excluded.invalid += 1; continue; }
    if (distanceM > radiusM) { excluded.outsideRadius += 1; continue; }

    const moodBand = moodScore(mood, place.category);
    if (moodBand.band === 'discouraged') excluded.noMatch += 1; // gently dropped for this mood

    const dScore = distanceScore(distanceM, radiusM);
    const travel = travelMinutes(distanceM);
    const prefsResult = preferenceScore(place, prefs);
    const time = timeComponent(place, prefs, travel);

    const moodScoreFinal = moodBand.score;
    const base = WEIGHTS.mood * moodScoreFinal + WEIGHTS.distance * dScore + WEIGHTS.preferences * prefsResult.score;
    let score = base;
    const reasons = [];

    // Personalisation: the user's own stored feedback nudge their own ranking.
    const own = feedbackGet(place.osmKey);
    let feedbackAdjustment = 0;
    if (own) {
      if (own.vote === 'like') { feedbackAdjustment += 6; reasons.push('you liked this place before'); }
      if (own.vote === 'dislike') { feedbackAdjustment -= 10; reasons.push('you disliked this place before'); }
      if (Number.isFinite(own.rating)) {
        const delta = (own.rating - 3) * 2; // -4 .. +4
        feedbackAdjustment += delta;
        if (own.rating >= 4) reasons.push(`you rated it ${own.rating}/5`);
        if (own.rating <= 2) reasons.push(`you rated it ${own.rating}/5`);
      }
    }
    score += feedbackAdjustment;

    const priceText = place.priceKnown && Number.isFinite(place.priceEstimate)
      ? `₹${place.priceEstimate}`
      : 'Price not available';
    const durationText = place.visitDurationKnown && Number.isFinite(place.typicalVisitMinutes)
      ? `~${place.typicalVisitMinutes} min (estimated)`
      : 'Visit duration not available';
    // Honest statement about opening hours: we do not parse them into "open now".
    const hoursText = place.openingHours
      ? `Opening hours metadata: ${place.openingHours} (not evaluated for "open now")`
      : 'Opening hours not recorded';

    reasons.unshift(`Recommended because ${moodReason(mood, place.category, moodBand.band, place)} and it is ${distanceBand(distanceM, radiusM)}.`);
    if (prefsResult.notes.length) reasons.push(...prefsResult.notes);
    if (time.note) reasons.push(time.note);

    scored.push({
      ...place,
      distanceM: Math.round(distanceM),
      distanceKm: Math.round(distanceM) / 1000,
      travelMinutes: travel,
      score: Math.max(0, Math.min(100, Math.round(score))),
      breakdown: {
        mood: { score: Math.round(moodScoreFinal), weight: WEIGHTS.mood, band: moodBand.band },
        distance: { score: dScore, weight: WEIGHTS.distance },
        preferences: { score: prefsResult.score, weight: WEIGHTS.preferences, parts: prefsResult.breakdown },
        time: { score: time.score, applied: time.applied },
        feedbackAdjustment
      },
      reasons: reasons.slice(0, 4),
      priceText,
      durationText,
      hoursText,
      metadataSource: 'openstreetmap'
    });
  }

  scored.sort((a, b) => b.score - a.score || a.distanceM - b.distanceM || String(a.name).localeCompare(String(b.name)));
  return { results: scored, excluded, weights: WEIGHTS, moodCatalogEntry: mood ? getMood(mood) : null, categoriesAvailable: CATEGORY_IDS };
}
