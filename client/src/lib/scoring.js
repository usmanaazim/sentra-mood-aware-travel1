/**
 * Client-side mirror of the server scoring pipeline (server/recommend.js).
 * Used ONLY by the clearly-labelled demo mode so the offline layout behaves like
 * the real thing. Live recommendations always come from the API.
 *
 *   final score = 50% mood/category compatibility
 *               + 30% distance suitability
 *               + 20% preference compatibility
 */
import { categoryLabel, moodScore } from './moods.js';
import { haversineMeters } from './geo.js';

export const WEIGHTS = { mood: 0.5, distance: 0.3, preferences: 0.2 };

export function distanceScore(distanceM, radiusM) {
  if (!Number.isFinite(distanceM) || !Number.isFinite(radiusM) || radiusM <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, distanceM / radiusM));
  return Math.round(100 * (1 - ratio ** 1.6));
}

export const travelMinutes = (m) => (Number.isFinite(m) ? Math.max(1, Math.round(m / (m <= 1200 ? 1.25 : 6.5) / 60)) : null);

const OUTDOOR = ['park', 'garden', 'playground', 'water_park', 'viewpoint', 'nature_reserve'];
const INDOOR = ['cafe', 'restaurant', 'museum'];

export function preferenceScore(place, prefs = {}) {
  const parts = [];
  if (prefs.categories?.length) {
    parts.push(prefs.categories.includes(place.category)
      ? { score: 100, note: 'matches one of your preferred categories' }
      : { score: 35, note: null });
  }
  if (prefs.indoorOutdoor === 'indoor' || prefs.indoorOutdoor === 'outdoor') {
    const isOutdoor = OUTDOOR.includes(place.category);
    const isIndoor = INDOOR.includes(place.category);
    let score = 60;
    if (prefs.indoorOutdoor === 'outdoor') score = isOutdoor ? 100 : isIndoor ? 35 : 60;
    else score = isIndoor ? 100 : isOutdoor ? 30 : 60;
    parts.push({ score, note: score >= 90 ? 'fits your indoor/outdoor preference' : null });
  }
  if (Number.isFinite(prefs.budgetInr)) {
    if (place.fee === 'no') parts.push({ score: 100, note: 'no entrance fee tagged in OpenStreetMap' });
    else if (place.fee === 'yes') parts.push({ score: prefs.budgetInr >= 500 ? 65 : 40, note: 'an entrance fee is tagged (amount unknown)' });
    else parts.push({ score: 60, note: null });
  }
  if (!parts.length) return { score: 70, notes: [] };
  const score = Math.round(parts.reduce((s, p) => s + p.score, 0) / parts.length);
  return { score, notes: parts.map((p) => p.note).filter(Boolean) };
}

/** Rank demo places; returns the same shape as the server response. */
export function rankDemoPlaces({ places, prefs, feedbackByKey = {} }) {
  const radiusM = prefs.radiusM || 3000;
  const origin = { lat: prefs.lat, lon: prefs.lon };
  const results = [];

  for (const place of places) {
    const distanceM = haversineMeters(origin, place);
    if (!Number.isFinite(distanceM) || distanceM > radiusM) continue;

    const band = moodScore(prefs.mood, place.category);
    if (band.band === 'discouraged') continue;

    const dScore = distanceScore(distanceM, radiusM);
    const pref = preferenceScore(place, prefs);
    const travel = travelMinutes(distanceM);
    let score = WEIGHTS.mood * band.score + WEIGHTS.distance * dScore + WEIGHTS.preferences * pref.score;

    const reasons = [];
    const own = feedbackByKey[place.osmKey];
    let feedbackAdjustment = 0;
    if (own) {
      if (own.vote === 'like') { feedbackAdjustment += 6; reasons.push('you liked this place before'); }
      if (own.vote === 'dislike') { feedbackAdjustment -= 10; reasons.push('you disliked this place before'); }
      if (Number.isFinite(own.rating)) feedbackAdjustment += (own.rating - 3) * 2;
    }
    score += feedbackAdjustment;

    const moodLine = band.band === 'primary'
      ? `it is a strong match for feeling ${prefs.mood}`
      : `it is a ${categoryLabel(place.category).toLowerCase()} near you`;
    reasons.unshift(`Recommended because ${moodLine} and it is ${distanceM <= radiusM * 0.25 ? 'very close by' : 'nearby'}.`);
    reasons.push(...pref.notes);

    results.push({
      ...place,
      distanceM: Math.round(distanceM),
      distanceKm: Math.round(distanceM) / 1000,
      travelMinutes: travel,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons: reasons.slice(0, 4),
      priceText: place.priceKnown && Number.isFinite(place.priceEstimate) ? `₹${place.priceEstimate}` : 'Price not available',
      durationText: place.visitDurationKnown && Number.isFinite(place.typicalVisitMinutes) ? `~${place.typicalVisitMinutes} min (estimated)` : 'Visit duration not available',
      hoursText: place.openingHours ? `Opening hours metadata: ${place.openingHours} (not evaluated for "open now")` : 'Opening hours not recorded',
      breakdown: {
        mood: { score: Math.round(band.score), weight: WEIGHTS.mood, band: band.band },
        distance: { score: dScore, weight: WEIGHTS.distance },
        preferences: { score: pref.score, weight: WEIGHTS.preferences },
        feedbackAdjustment
      }
    });
  }

  results.sort((a, b) => b.score - a.score || a.distanceM - b.distanceM);
  return results;
}
