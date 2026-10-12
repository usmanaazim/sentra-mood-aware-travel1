/**
 * Mood + category catalogue.
 *
 * NOTE: this mirrors server/mood.js so the interface stays responsive, and it is
 * what powers the clearly-labelled offline DEMO MODE (which never calls the API).
 * Live recommendations always come from the server so the ranking logic has a
 * single source of truth.
 */
export const CATEGORIES = [
  { id: 'park', label: 'Park', emoji: '🌳' },
  { id: 'garden', label: 'Garden', emoji: '🌷' },
  { id: 'cafe', label: 'Cafe', emoji: '☕' },
  { id: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { id: 'museum', label: 'Museum', emoji: '🏛️' },
  { id: 'attraction', label: 'Attraction', emoji: '🎡' },
  { id: 'playground', label: 'Playground', emoji: '🛝' },
  { id: 'water_park', label: 'Water park', emoji: '🌊' },
  { id: 'viewpoint', label: 'Viewpoint', emoji: '🗻' },
  { id: 'nature_reserve', label: 'Nature reserve', emoji: '🦌' }
];

export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id || 'Place';
export const categoryEmoji = (id) => CATEGORIES.find((c) => c.id === id)?.emoji || '📍';

export const MOODS = [
  { id: 'happy', label: 'Happy', emoji: '😊', blurb: 'Explore social and lively destinations.', match: ['cafe', 'restaurant', 'attraction'], avoid: ['nature_reserve'] },
  { id: 'calm', label: 'Calm', emoji: '🌿', blurb: 'Find quiet and peaceful places.', match: ['garden', 'park', 'viewpoint'], avoid: ['water_park', 'playground'] },
  { id: 'stressed', label: 'Stressed', emoji: '😮‍💨', blurb: 'Discover relaxing environments.', match: ['park', 'garden', 'nature_reserve'], avoid: ['playground', 'water_park'] },
  { id: 'sad', label: 'Sad', emoji: '🌧️', blurb: 'Gentle, low-effort outing ideas.', match: ['park', 'garden', 'nature_reserve'], avoid: ['playground', 'water_park', 'attraction'] },
  { id: 'bored', label: 'Bored', emoji: '🥱', blurb: 'Find entertaining activities.', match: ['museum', 'attraction', 'playground'], avoid: ['nature_reserve'] },
  { id: 'adventurous', label: 'Adventurous', emoji: '🧭', blurb: 'Find activities and attractions.', match: ['viewpoint', 'attraction', 'nature_reserve'], avoid: ['cafe'] },
  { id: 'romantic', label: 'Romantic', emoji: '💞', blurb: 'Discover suitable scenic locations.', match: ['garden', 'viewpoint', 'restaurant'], avoid: ['playground'] },
  { id: 'curious', label: 'Curious', emoji: '🔍', blurb: 'Discover museums and interesting places.', match: ['museum', 'attraction'], avoid: [] }
];

export const moodById = (id) => MOODS.find((m) => m.id === id) || null;

/** Mirrors the server's mood/category compatibility bands (0-100). */
export function moodScore(moodId, categoryId) {
  const mood = moodById(moodId);
  if (!mood) return { score: 50, band: 'neutral' };
  if (mood.match.includes(categoryId)) return { score: 100, band: 'primary' };
  if (mood.avoid.includes(categoryId)) return { score: 25, band: 'discouraged' };
  return { score: 70, band: 'secondary' };
}

/* ------------------- keyword-only mood interpretation -------------------- */
/**
 * Client-side mirror of the server's heuristic. Direct emotional words weigh
 * more than situational words. This is keyword matching, NOT a language model,
 * and it never diagnoses emotion - the suggestion is always overridable.
 */
const STATE_WORDS = {
  happy: ['happy', 'excited', 'cheerful', 'energetic'],
  calm: ['calm', 'peaceful', 'tranquil', 'serene', 'relaxed'],
  stressed: ['stressed', 'stress', 'tense', 'overwhelmed', 'burnout', 'anxious', 'exhausted'],
  sad: ['sad', 'lonely', 'upset', 'gloomy', 'heartbroken'],
  bored: ['bored', 'boring', 'idle', 'restless'],
  adventurous: ['adventurous'],
  romantic: ['romantic', 'in love'],
  curious: ['curious', 'inquisitive']
};

const GOAL_WORDS = {
  happy: ['celebrate', 'friends', 'fun', 'party', 'good mood', 'lively', 'treat myself'],
  calm: ['quiet', 'relax', 'slow', 'unwind', 'breathe', 'no crowd', 'silence'],
  stressed: ['hectic', 'deadline', 'heavy workload', 'pressure', 'too much work', 'need a break'],
  sad: ['feeling low', 'feeling down', 'feeling blue', 'bad day', 'cheer up', 'quiet company'],
  bored: ['nothing to do', 'entertain', 'kill time', 'something different', 'new activity'],
  adventurous: ['adventure', 'explore', 'hike', 'trek', 'outdoors', 'thrill', 'new place', 'wander', 'offbeat'],
  romantic: ['date', 'partner', 'anniversary', 'couple', 'sunset', 'together', 'candlelight'],
  curious: ['learn', 'history', 'culture', 'art', 'museum', 'exhibition', 'interesting', 'knowledge', 'heritage']
};

export function interpretMoodText(text) {
  if (!text || !text.trim()) return null;
  const haystack = text.toLowerCase();

  const collect = (words, weight) => words
    .filter((w) => haystack.includes(w))
    .map((w) => ({ word: w, weight: weight + (w.includes(' ') ? 1 : 0), at: haystack.indexOf(w) }));

  let best = null;
  for (const mood of MOODS) {
    let hits = [...collect(STATE_WORDS[mood.id] || [], 3), ...collect(GOAL_WORDS[mood.id] || [], 1)];
    if (!hits.length) continue;
    hits = hits.filter((h) => !hits.some((o) => o !== h && o.word !== h.word && o.word.includes(h.word)));
    const score = hits.reduce((sum, h) => sum + h.weight, 0);
    const earliest = Math.min(...hits.map((h) => h.at));
    if (!best || score > best.score || (score === best.score && earliest < best.earliest)) {
      best = { mood: mood.id, score, earliest, hits };
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
