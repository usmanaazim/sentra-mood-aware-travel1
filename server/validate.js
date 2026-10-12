/**
 * Pure validation helpers shared by routes and tests.
 * Every function returns { ok, value } or { ok: false, errors: string[] }.
 */
import { CATEGORY_IDS, MOOD_IDS } from './mood.js';

export const LIMITS = {
  RADIUS_MIN_M: 500,
  RADIUS_MAX_M: 5000,
  BUDGET_MIN_INR: 0,
  BUDGET_MAX_INR: 100000,
  TIME_MIN_MIN: 30,
  TIME_MAX_MIN: 720,
  NAME_MAX: 80,
  EMAIL_MAX: 254,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  PURPOSE_MAX: 200,
  ACCESSIBILITY_MAX: 200,
  COMMENT_MAX: 500,
  FEEDBACK_MAX_RECORDS: 500,
  TOKENS_MIN: 2,
  TOKENS_MAX: 40
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export const fail = (errors) => ({ ok: false, errors: Array.isArray(errors) ? errors : [errors] });
export const pass = (value) => ({ ok: true, value });

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export function isEmail(email) {
  const e = normalizeEmail(email);
  return e.length > 0 && e.length <= LIMITS.EMAIL_MAX && EMAIL_RE.test(e);
}

/** Password strength: length plus a little variety. Returns a list of problems. */
export function passwordProblems(password) {
  const problems = [];
  const p = String(password ?? '');
  if (p.length < LIMITS.PASSWORD_MIN) problems.push(`Password must be at least ${LIMITS.PASSWORD_MIN} characters long.`);
  if (p.length > LIMITS.PASSWORD_MAX) problems.push(`Password must be at most ${LIMITS.PASSWORD_MAX} characters long.`);
  if (p.length >= LIMITS.PASSWORD_MIN) {
    const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(p)).length;
    if (variety < 2) problems.push('Password must mix at least two of: lowercase, uppercase, numbers, symbols.');
  }
  return problems;
}

export function validateRegister(body = {}) {
  const errors = [];
  const name = String(body.name ?? '').trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? '');
  const confirm = String(body.confirmPassword ?? body.confirm ?? '');

  if (name.length < 2) errors.push('Please enter your full name (at least 2 characters).');
  if (name.length > LIMITS.NAME_MAX) errors.push(`Name must be at most ${LIMITS.NAME_MAX} characters.`);
  if (!isEmail(email)) errors.push('Please enter a valid email address.');
  errors.push(...passwordProblems(password));
  if (password !== confirm) errors.push('Password and confirmation do not match.');

  if (errors.length) return fail(errors);
  return pass({ name, email, password });
}

export function validateLogin(body = {}) {
  const errors = [];
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? '');
  if (!isEmail(email)) errors.push('Please enter a valid email address.');
  if (password.length === 0) errors.push('Please enter your password.');
  if (errors.length) return fail(errors);
  return pass({ email, password });
}

export function asNumber(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function validateCoords(lat, lon) {
  const errors = [];
  const la = asNumber(lat);
  const lo = asNumber(lon);
  if (Number.isNaN(la) || la < -90 || la > 90) errors.push('lat must be a number between -90 and 90.');
  if (Number.isNaN(lo) || lo < -180 || lo > 180) errors.push('lon must be a number between -180 and 180.');
  if (errors.length) return fail(errors);
  return pass({ lat: la, lon: lo });
}

/** Clamp radius into the range the public Overpass service can serve quickly. */
export function clampRadius(radiusM) {
  const r = asNumber(radiusM);
  if (Number.isNaN(r)) return LIMITS.RADIUS_MAX_M;
  return Math.min(LIMITS.RADIUS_MAX_M, Math.max(LIMITS.RADIUS_MIN_M, Math.round(r)));
}

const INDOOR_OUTDOOR = ['any', 'indoor', 'outdoor'];

/**
 * Validate + normalise the preference payload used by /api/recommendations and
 * /api/profile/preferences. Coordinates are required for live searches but not
 * for saved preferences (SENTRA does not persist precise location).
 */
export function validatePreferences(body = {}, { requireLocation = true } = {}) {
  const errors = [];
  const out = {};

  const mood = body.mood === undefined || body.mood === null || body.mood === '' ? null : String(body.mood);
  if (mood !== null && !MOOD_IDS.includes(mood)) errors.push(`mood must be one of: ${MOOD_IDS.join(', ')}.`);
  out.mood = mood;

  const hasLocation = !(body.lat === undefined || body.lat === null || body.lat === '');
  if (requireLocation || hasLocation) {
    const lat = asNumber(body.lat);
    const lon = asNumber(body.lon);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) errors.push('lat must be a number between -90 and 90.');
    if (Number.isNaN(lon) || lon < -180 || lon > 180) errors.push('lon must be a number between -180 and 180.');
    out.lat = lat;
    out.lon = lon;
  } else {
    out.lat = null;
    out.lon = null;
    out.locationProvided = false;
  }

  out.radiusM = clampRadius(body.radiusM ?? body.radius);
  if (body.radiusM !== undefined || body.radius !== undefined) {
    const raw = asNumber(body.radiusM ?? body.radius);
    if (Number.isNaN(raw) || raw <= 0) errors.push('radius must be a positive number of metres.');
    else if (raw < LIMITS.RADIUS_MIN_M || raw > LIMITS.RADIUS_MAX_M) {
      // Clamped rather than rejected, but tell the caller.
      out.radiusClampedFrom = Math.round(raw);
    }
  }

  const budgetRaw = body.budgetInr ?? body.budget;
  if (budgetRaw === undefined || budgetRaw === null || budgetRaw === '') {
    out.budgetInr = null;
  } else {
    const b = asNumber(budgetRaw);
    if (Number.isNaN(b) || b < LIMITS.BUDGET_MIN_INR || b > LIMITS.BUDGET_MAX_INR) {
      errors.push(`budgetInr must be between ${LIMITS.BUDGET_MIN_INR} and ${LIMITS.BUDGET_MAX_INR}.`);
    } else out.budgetInr = Math.round(b);
  }

  const timeRaw = body.timeMinutes ?? body.time;
  if (timeRaw === undefined || timeRaw === null || timeRaw === '') {
    out.timeMinutes = null;
  } else {
    const t = asNumber(timeRaw);
    if (Number.isNaN(t) || t < LIMITS.TIME_MIN_MIN || t > LIMITS.TIME_MAX_MIN) {
      errors.push(`timeMinutes must be between ${LIMITS.TIME_MIN_MIN} and ${LIMITS.TIME_MAX_MIN}.`);
    } else out.timeMinutes = Math.round(t);
  }

  if (body.categories === undefined || body.categories === null) {
    out.categories = [];
  } else if (!Array.isArray(body.categories)) {
    errors.push('categories must be an array of category ids.');
  } else {
    const unknown = body.categories.filter((c) => !CATEGORY_IDS.includes(c));
    if (unknown.length) errors.push(`Unknown categories: ${unknown.join(', ')}.`);
    out.categories = Array.from(new Set(body.categories)).slice(0, CATEGORY_IDS.length);
  }

  const io = body.indoorOutdoor === undefined || body.indoorOutdoor === null ? 'any' : String(body.indoorOutdoor);
  if (!INDOOR_OUTDOOR.includes(io)) errors.push(`indoorOutdoor must be one of: ${INDOOR_OUTDOOR.join(', ')}.`);
  out.indoorOutdoor = io;

  const purpose = body.purpose === undefined || body.purpose === null ? '' : String(body.purpose).trim();
  if (purpose.length > LIMITS.PURPOSE_MAX) errors.push(`purpose must be at most ${LIMITS.PURPOSE_MAX} characters.`);
  out.purpose = purpose;

  const accessibility = body.accessibility === undefined || body.accessibility === null ? '' : String(body.accessibility).trim();
  if (accessibility.length > LIMITS.ACCESSIBILITY_MAX) errors.push(`accessibility must be at most ${LIMITS.ACCESSIBILITY_MAX} characters.`);
  out.accessibility = accessibility;

  const freeText = body.freeText === undefined || body.freeText === null ? '' : String(body.freeText).trim();
  if (freeText.length > 300) errors.push('freeText must be at most 300 characters.');
  out.freeText = freeText;

  // If the caller sent a free-text wish and no explicit mood, suggest one heuristically.
  if (!out.mood && freeText) {
    out.moodSuggestion = interpretMoodTextCached(freeText);
  }

  if (errors.length) return fail(errors);
  return pass(out);
}

// Small indirection so validate.js has no circular import with mood.js helpers used at module load.
let interpretMoodTextCached = () => null;
export function setMoodInterpreter(fn) { interpretMoodTextCached = fn; }

export function validateFeedback(body = {}) {
  const errors = [];
  const vote = body.vote === undefined || body.vote === null || body.vote === '' ? null : String(body.vote);
  if (vote !== null && !['like', 'dislike'].includes(vote)) errors.push("vote must be 'like' or 'dislike'.");

  let rating = null;
  if (body.rating !== undefined && body.rating !== null && body.rating !== '') {
    const r = asNumber(body.rating);
    if (Number.isNaN(r) || !Number.isInteger(r) || r < 1 || r > 5) errors.push('rating must be a whole number between 1 and 5.');
    else rating = r;
  }

  const comment = body.comment === undefined || body.comment === null ? '' : String(body.comment).trim();
  if (comment.length > LIMITS.COMMENT_MAX) errors.push(`comment must be at most ${LIMITS.COMMENT_MAX} characters.`);

  const osmKey = String(body.osmKey ?? '').trim();
  if (!/^(node|way|relation)\/[1-9][0-9]{0,18}$/.test(osmKey)) {
    errors.push('osmKey must look like "node/12345", "way/12345" or "relation/12345".');
  }

  const name = String(body.name ?? '').trim();
  if (name.length > LIMITS.NAME_MAX) errors.push(`name must be at most ${LIMITS.NAME_MAX} characters.`);
  const category = String(body.category ?? '').trim();
  if (category && !CATEGORY_IDS.includes(category)) errors.push(`Unknown category: ${category}.`);

  if (vote === null && rating === null && comment === '') {
    errors.push('Provide at least a vote, a rating or a comment.');
  }

  if (errors.length) return fail(errors);
  return pass({ osmKey, name, category, vote, rating, comment });
}
