import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEIGHTS, distanceScore, haversineMeters, preferenceScore, recommend, travelMinutes
} from '../recommend.js';
import { moodScore } from '../mood.js';

const BLR = { lat: 12.9716, lon: 77.5946 };
const place = (osmId, name, category, lat, lon, extra = {}) => ({
  osmType: 'node', osmId, osmKey: `node/${osmId}`, name, category, lat, lon,
  address: null, openingHours: null, website: null, fee: null, wheelchair: null,
  priceEstimate: null, priceKnown: false, typicalVisitMinutes: null, visitDurationKnown: false, ...extra
});

test('haversine: identical points are zero metres apart', () => {
  assert.equal(haversineMeters(BLR, BLR), 0);
});

test('haversine: known Bengaluru distances are accurate within 1%', () => {
  // Cubbon Park area -> Lalbagh area is ~4.1 km in a straight line.
  const cubbon = { lat: 12.9763, lon: 77.5929 };
  const lalbagh = { lat: 12.9507, lon: 77.5848 };
  const d = haversineMeters(cubbon, lalbagh);
  assert.ok(d > 2800 && d < 3200, `expected ~2.9km, got ${d}`);

  // One degree of latitude is ~111.2 km.
  const oneDegree = haversineMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  assert.ok(Math.abs(oneDegree - 111195) < 1200, `expected ~111.2km, got ${oneDegree}`);
});

test('haversine: invalid input returns NaN instead of throwing', () => {
  assert.ok(Number.isNaN(haversineMeters({ lat: 'x', lon: 0 }, BLR)));
  assert.ok(Number.isNaN(haversineMeters(null, BLR)));
});

test('distanceScore: rewards proximity and decays with distance', () => {
  assert.equal(distanceScore(0, 3000), 100);
  assert.ok(distanceScore(750, 3000) > distanceScore(2000, 3000));
  assert.ok(distanceScore(2000, 3000) > distanceScore(2999, 3000));
  assert.equal(distanceScore(3000, 3000), 0);
  assert.equal(distanceScore(-5, 3000), 100); // defensive clamp
});

test('travelMinutes: walking pace for short hops, riding pace beyond', () => {
  assert.equal(travelMinutes(500), 7);   // 500 m at 1.25 m/s
  assert.ok(travelMinutes(4000) < travelMinutes(2000) * 2.2);
});

test('mood compatibility: stressed favours parks, discourages playgrounds', () => {
  assert.equal(moodScore('stressed', 'park').score, 100);
  assert.equal(moodScore('stressed', 'garden').score, 100);
  assert.ok(moodScore('stressed', 'playground').score < moodScore('stressed', 'nature_reserve').score);
  assert.equal(moodScore('bored', 'museum').score, 100);
  assert.equal(moodScore('curious', 'attraction').band, 'primary');
  assert.equal(moodScore('romantic', 'viewpoint').band, 'primary');
  // Unknown mood / category never throws and stays neutral.
  assert.equal(moodScore(null, 'park').score, 50);
  assert.equal(moodScore('happy', 'not_a_category').band, 'unknown category');
});

test('weights are documented and sum to 1', () => {
  assert.equal(WEIGHTS.mood + WEIGHTS.distance + WEIGHTS.preferences, 1);
});

test('preferenceScore: uses only known metadata and stays neutral when unknown', () => {
  const neutral = preferenceScore(place(1, 'A', 'park', 12.97, 77.59), { categories: [], indoorOutdoor: 'any' });
  assert.equal(neutral.score, 70);

  const outdoor = preferenceScore(place(2, 'B', 'park', 12.97, 77.59), { categories: ['park'], indoorOutdoor: 'outdoor' });
  assert.equal(outdoor.score, 100);
  assert.ok(outdoor.notes.length >= 1);

  // Budget: unknown fee must not be treated as free or as expensive.
  const unknownFee = preferenceScore(place(3, 'C', 'cafe', 12.97, 77.59), { budgetInr: 300 });
  const freeTagged = preferenceScore(place(4, 'D', 'park', 12.97, 77.59, { fee: 'no' }), { budgetInr: 300 });
  assert.ok(freeTagged.score > unknownFee.score);
  assert.ok(unknownFee.score > 0, 'unknown price must never exclude a place');

  // Wheelchair unknown -> neutral, never fabricated.
  const unknownWheelchair = preferenceScore(place(5, 'E', 'museum', 12.97, 77.59), { accessibility: 'wheelchair access' });
  const yesWheelchair = preferenceScore(place(6, 'F', 'museum', 12.97, 77.59, { wheelchair: 'yes' }), { accessibility: 'wheelchair access' });
  assert.ok(yesWheelchair.score > unknownWheelchair.score);
});

test('recommend: sorts by final score and excludes places outside the radius', () => {
  const places = [
    place(1, 'Far Park', 'park', 12.9999, 77.6500),      // ~7 km away - outside 3 km
    place(2, 'Near Garden', 'garden', 12.9730, 77.5960), // ~200 m away
    place(3, 'Mid Cafe', 'cafe', 12.9800, 77.6050)       // ~1.5 km away
  ];
  const { results, excluded } = recommend({
    places,
    prefs: { lat: BLR.lat, lon: BLR.lon, radiusM: 3000, mood: 'calm', categories: [], indoorOutdoor: 'any' }
  });
  assert.equal(results.length, 2);
  assert.equal(excluded.outsideRadius, 1);
  assert.equal(results[0].name, 'Near Garden');
  assert.ok(results[0].score >= results[1].score);
  assert.ok(results.every((r) => r.distanceM <= 3000));
});

test('recommend: explains every result and never fabricates price or duration', () => {
  const { results } = recommend({
    places: [place(9, 'Quiet Park', 'park', 12.9720, 77.5950)],
    prefs: { lat: BLR.lat, lon: BLR.lon, radiusM: 3000, mood: 'stressed', categories: [] }
  });
  const r = results[0];
  assert.equal(r.reasons.length >= 1, true);
  assert.match(r.reasons[0], /Recommended because/);
  assert.equal(r.priceText, 'Price not available');
  assert.equal(r.durationText, 'Visit duration not available');
  assert.match(r.hoursText, /not recorded/);
  assert.equal(r.breakdown.mood.weight + r.breakdown.distance.weight + r.breakdown.preferences.weight, 1);
  // Opening-hours metadata alone must not claim "open now".
  const { results: withHours } = recommend({
    places: [place(10, 'Cafe Hours', 'cafe', 12.9720, 77.5950, { openingHours: 'Mo-Su 09:00-21:00' })],
    prefs: { lat: BLR.lat, lon: BLR.lon, radiusM: 3000, mood: 'happy' }
  });
  assert.match(withHours[0].hoursText, /not evaluated for "open now"/);
});

test('recommend: stored feedback adjusts the score of that place only', () => {
  const places = [place(11, 'Same Cafe', 'cafe', 12.9720, 77.5950)];
  const prefs = { lat: BLR.lat, lon: BLR.lon, radiusM: 3000, mood: 'happy' };
  const base = recommend({ places, prefs }).results[0];
  const liked = recommend({ places, prefs, feedback: new Map([['node/11', { vote: 'like', rating: 5 }]]) }).results[0];
  const disliked = recommend({ places, prefs, feedback: new Map([['node/11', { vote: 'dislike', rating: 1 }]]) }).results[0];
  assert.ok(liked.score > base.score, 'like should raise the score');
  assert.ok(disliked.score < base.score, 'dislike should lower the score');
  assert.ok(liked.score <= 100 && disliked.score >= 0, 'score stays within 0-100');
  assert.ok(liked.reasons.some((r) => /liked this place/.test(r)));
});

test('recommend: empty input produces an empty result set, not an error', () => {
  const { results, excluded } = recommend({ places: [], prefs: { lat: BLR.lat, lon: BLR.lon, radiusM: 3000, mood: 'happy' } });
  assert.deepEqual(results, []);
  assert.equal(excluded.outsideRadius, 0);
});
