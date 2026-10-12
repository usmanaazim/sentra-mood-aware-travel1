/**
 * Mood catalogue + lightweight keyword interpretation.
 *
 * IMPORTANT: the free-text interpreter below is a small hand-written keyword and
 * phrase heuristic. It is NOT a trained language model, and the app never claims
 * that it is. It never diagnoses emotion or makes medical claims.
 */

/** Canonical place categories SENTRA supports (mapped to OpenStreetMap tags). */
export const CATEGORIES = {
  park: { label: 'Park', osm: [{ k: 'leisure', v: 'park' }] },
  garden: { label: 'Garden', osm: [{ k: 'leisure', v: 'garden' }] },
  cafe: { label: 'Cafe', osm: [{ k: 'amenity', v: 'cafe' }] },
  restaurant: { label: 'Restaurant', osm: [{ k: 'amenity', v: 'restaurant' }] },
  museum: { label: 'Museum', osm: [{ k: 'tourism', v: 'museum' }] },
  attraction: { label: 'Attraction', osm: [{ k: 'tourism', v: 'attraction' }] },
  playground: { label: 'Playground', osm: [{ k: 'leisure', v: 'playground' }] },
  water_park: { label: 'Water park', osm: [{ k: 'leisure', v: 'water_park' }] },
  viewpoint: { label: 'Viewpoint', osm: [{ k: 'tourism', v: 'viewpoint' }] },
  nature_reserve: { label: 'Nature reserve', osm: [{ k: 'leisure', v: 'nature_reserve' }] }
};

export const CATEGORY_IDS = Object.keys(CATEGORIES);
export const categoryLabel = (id) => CATEGORIES[id]?.label || (id ? String(id) : 'Other');

const P = 100; // primary match
const S = 78;  // secondary match
const N = 52;  // neutral
const A = 25;  // discouraged for this mood

/** Recommendation heuristics only - not scientific claims about wellbeing. */
// `stateKeywords` are direct emotional/state words; `keywords` are situational or
// goal words. State matches weigh more, which keeps "I feel stressed, somewhere
// quiet" classified by the emotional word rather than the goal word.
export const MOODS = [
  {
    id: 'happy',
    label: 'Happy',
    emoji: '😊',
    blurb: 'Explore social and lively destinations.',
    primary: ['cafe', 'restaurant', 'attraction'],
    secondary: ['park', 'garden', 'playground', 'viewpoint', 'water_park'],
    discouraged: ['nature_reserve'],
    stateKeywords: ['happy', 'excited', 'cheerful', 'energetic'],
    keywords: ['celebrate', 'friends', 'fun', 'party', 'good mood', 'lively', 'treat myself']
  },
  {
    id: 'calm',
    label: 'Calm',
    emoji: '🌿',
    blurb: 'Find quiet and peaceful places.',
    primary: ['garden', 'park', 'viewpoint'],
    secondary: ['nature_reserve', 'cafe', 'museum'],
    discouraged: ['water_park', 'playground'],
    stateKeywords: ['calm', 'peaceful', 'tranquil', 'serene', 'relaxed'],
    keywords: ['quiet', 'relax', 'slow', 'unwind', 'breathe', 'no crowd', 'silence']
  },
  {
    id: 'stressed',
    label: 'Stressed',
    emoji: '😮‍💨',
    blurb: 'Discover relaxing environments.',
    primary: ['park', 'garden', 'nature_reserve'],
    secondary: ['viewpoint', 'cafe', 'museum'],
    discouraged: ['playground', 'water_park'],
    stateKeywords: ['stressed', 'stress', 'tense', 'overwhelmed', 'burnout', 'anxious', 'exhausted'],
    keywords: ['hectic', 'deadline', 'heavy workload', 'pressure', 'too much work', 'need a break']
  },
  {
    id: 'sad',
    label: 'Sad',
    emoji: '🌧️',
    blurb: 'Gentle, low-effort outing ideas - no emotional claims.',
    primary: ['park', 'garden', 'nature_reserve'],
    secondary: ['viewpoint', 'cafe'],
    discouraged: ['playground', 'water_park', 'attraction'],
    stateKeywords: ['sad', 'lonely', 'upset', 'gloomy', 'heartbroken'],
    keywords: ['feeling low', 'feeling down', 'feeling blue', 'bad day', 'cheer up', 'quiet company']
  },
  {
    id: 'bored',
    label: 'Bored',
    emoji: '🥱',
    blurb: 'Find entertaining activities.',
    primary: ['museum', 'attraction', 'playground'],
    secondary: ['water_park', 'cafe', 'restaurant'],
    discouraged: ['nature_reserve'],
    stateKeywords: ['bored', 'boring', 'idle', 'restless'],
    keywords: ['nothing to do', 'entertain', 'kill time', 'something different', 'new activity']
  },
  {
    id: 'adventurous',
    label: 'Adventurous',
    emoji: '🧭',
    blurb: 'Find activities and attractions.',
    primary: ['viewpoint', 'attraction', 'nature_reserve'],
    secondary: ['water_park', 'park', 'playground'],
    discouraged: ['cafe'],
    stateKeywords: ['adventurous', 'restless to explore'],
    keywords: ['adventure', 'explore', 'hike', 'trek', 'outdoors', 'thrill', 'new place', 'wander', 'offbeat']
  },
  {
    id: 'romantic',
    label: 'Romantic',
    emoji: '💞',
    blurb: 'Discover suitable scenic locations.',
    primary: ['garden', 'viewpoint', 'restaurant'],
    secondary: ['cafe', 'park', 'attraction'],
    discouraged: ['playground'],
    stateKeywords: ['romantic', 'in love'],
    keywords: ['date', 'partner', 'anniversary', 'couple', 'sunset', 'together', 'candlelight']
  },
  {
    id: 'curious',
    label: 'Curious',
    emoji: '🔍',
    blurb: 'Discover museums and interesting places.',
    primary: ['museum', 'attraction'],
    secondary: ['viewpoint', 'nature_reserve', 'cafe', 'restaurant'],
    discouraged: [],
    stateKeywords: ['curious', 'inquisitive'],
    keywords: ['learn', 'history', 'culture', 'art', 'museum', 'exhibition', 'interesting', 'knowledge', 'heritage']
  }
];

export const MOOD_IDS = MOODS.map((m) => m.id);
const MOOD_MAP = new Map(MOODS.map((m) => [m.id, m]));

export const isMood = (id) => MOOD_MAP.has(id);
export const getMood = (id) => MOOD_MAP.get(id) || null;

/** Mood -> category compatibility score (0-100) plus a human-readable band. */
export function moodScore(moodId, categoryId) {
  const mood = MOOD_MAP.get(moodId);
  if (!mood) return { score: 50, band: 'neutral' };
  if (!CATEGORY_IDS.includes(categoryId)) return { score: 45, band: 'unknown category' };
  if (mood.primary.includes(categoryId)) return { score: P, band: 'primary' };
  if (mood.secondary.includes(categoryId)) return { score: S, band: 'secondary' };
  if (mood.discouraged.includes(categoryId)) return { score: A, band: 'discouraged' };
  return { score: N, band: 'neutral' };
}

/**
 * Heuristic keyword interpretation of a free-text wish.
 *
 * This is a small hand-written keyword matcher - NOT a trained language model -
 * and it makes no attempt to diagnose emotion. Direct emotional words
 * ("I feel stressed") weigh more than situational/goal words ("somewhere quiet").
 * The suggestion is always surfaced to the user, who can override it.
 */
export function interpretMoodText(text) {
  if (!text || typeof text !== 'string') return null;
  const haystack = text.toLowerCase();

  const matchesFor = (words, weight) => words
    .filter((w) => haystack.includes(w))
    .map((w) => ({ word: w, weight: weight + (w.includes(' ') ? 1 : 0), at: haystack.indexOf(w) }));

  let best = null;
  for (const mood of MOODS) {
    const stateHits = matchesFor(mood.stateKeywords || [], 3);
    const goalHits = matchesFor(mood.keywords || [], 1);
    let hits = [...stateHits, ...goalHits];
    if (!hits.length) continue;

    // Drop keywords that are plain substrings of a longer match ("stress" inside
    // "stressed") so a single mention is not counted twice.
    hits = hits.filter((h) => !hits.some((o) => o !== h && o.word !== h.word && o.word.includes(h.word)));

    const score = hits.reduce((sum, h) => sum + h.weight, 0);
    const earliest = Math.min(...hits.map((h) => h.at));
    const candidate = { mood: mood.id, score, earliest, hits };
    // Highest score wins; ties go to the mood whose keyword appears first.
    if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.earliest < best.earliest)) {
      best = candidate;
    }
  }

  if (!best) return null;
  return {
    mood: best.mood,
    matchedKeywords: best.hits.map((h) => h.word),
    confidence: best.score >= 3 ? 'clear keyword match' : 'weak keyword match',
    method: 'keyword-heuristic',
    note: 'Lightweight keyword matching (not a language model). You can change the mood any time.'
  };
}

/**
 * Derive a display/filter category from OpenStreetMap tags.
 * Returns null for elements that are not one of the supported categories.
 */
export function categoryFromTags(tags = {}) {
  for (const [id, def] of Object.entries(CATEGORIES)) {
    for (const { k, v } of def.osm) {
      if (tags[k] === v) return id;
    }
  }
  return null;
}
