import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, clampRadius, isEmail, normalizeEmail, passwordProblems, validateCoords,
  validateFeedback, validateLogin, validatePreferences, validateRegister
} from '../validate.js';
import { interpretMoodText } from '../mood.js';

test('email validation accepts normal addresses and rejects malformed ones', () => {
  assert.ok(isEmail('traveler@example.com'));
  assert.ok(isEmail('a.b+tag@sub.example.co.in'));
  assert.equal(isEmail('no-at-sign'), false);
  assert.equal(isEmail('missing@tld'), false);
  assert.equal(isEmail(''), false);
  assert.equal(normalizeEmail('  Traveler@Example.COM '), 'traveler@example.com');
});

test('registration validation enforces name, email, password length and confirmation', () => {
  const good = validateRegister({ name: 'Asha Rao', email: 'asha@example.com', password: 'Sunlight42', confirmPassword: 'Sunlight42' });
  assert.equal(good.ok, true);
  assert.equal(good.value.email, 'asha@example.com');

  const mismatched = validateRegister({ name: 'Asha Rao', email: 'asha@example.com', password: 'Sunlight42', confirmPassword: 'Sunlight43' });
  assert.equal(mismatched.ok, false);
  assert.ok(mismatched.errors.some((e) => /do not match/.test(e)));

  const short = validateRegister({ name: 'A B', email: 'a@b.co', password: 'short', confirmPassword: 'short' });
  assert.equal(short.ok, false);
  assert.ok(short.errors.some((e) => /at least 8 characters/.test(e)));

  const weak = validateRegister({ name: 'Asha Rao', email: 'asha@example.com', password: 'passwordonly', confirmPassword: 'passwordonly' });
  assert.equal(weak.ok, false, 'single-character-class passwords are rejected');
});

test('password problems are reported, never silently accepted', () => {
  assert.deepEqual(passwordProblems('Sunlight42'), []);
  assert.equal(passwordProblems('a'.repeat(LIMITS.PASSWORD_MAX + 1)).length > 0, true);
});

test('login validation requires a valid email and a password', () => {
  assert.equal(validateLogin({ email: 'x@y.co', password: 'secret123' }).ok, true);
  const bad = validateLogin({ email: 'nope', password: '' });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 2);
});

test('coordinate validation rejects out-of-range and non-numeric values', () => {
  assert.equal(validateCoords(12.9716, 77.5946).ok, true);
  assert.equal(validateCoords(-90, 180).ok, true);
  const oob = validateCoords(91, 77);
  assert.equal(oob.ok, false);
  assert.match(oob.errors[0], /lat must be/);
  assert.equal(validateCoords(12.97, 181).ok, false);
  assert.equal(validateCoords('abc', 'def').ok, false);
  assert.equal(validateCoords(undefined, undefined).ok, false);
});

test('radius is clamped to 500m - 5000m', () => {
  assert.equal(clampRadius(100), LIMITS.RADIUS_MIN_M);
  assert.equal(clampRadius(99999), LIMITS.RADIUS_MAX_M);
  assert.equal(clampRadius(2500), 2500);
  assert.equal(clampRadius(undefined), LIMITS.RADIUS_MAX_M);
});

test('preferences: defaults, clamping and rejection of unknown categories', () => {
  const ok = validatePreferences({ lat: 12.9716, lon: 77.5946, mood: 'calm', radiusM: 3000, budgetInr: 300, timeMinutes: 120 });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.mood, 'calm');
  assert.equal(ok.value.indoorOutdoor, 'any');

  const clamped = validatePreferences({ lat: 12.9716, lon: 77.5946, radiusM: 100000 });
  assert.equal(clamped.ok, true);
  assert.equal(clamped.value.radiusM, LIMITS.RADIUS_MAX_M);
  assert.equal(clamped.value.radiusClampedFrom, 100000);

  const badMood = validatePreferences({ lat: 12.9716, lon: 77.5946, mood: 'ecstatic' });
  assert.equal(badMood.ok, false);

  const badCategory = validatePreferences({ lat: 12.9716, lon: 77.5946, categories: ['park', 'spaceport'] });
  assert.equal(badCategory.ok, false);
  assert.ok(badCategory.errors.some((e) => /Unknown categories/.test(e)));

  const badBudget = validatePreferences({ lat: 12.9716, lon: 77.5946, budgetInr: -50 });
  assert.equal(badBudget.ok, false);

  const badTime = validatePreferences({ lat: 12.9716, lon: 77.5946, timeMinutes: 5 });
  assert.equal(badTime.ok, false);

  // Fields are optional.
  const minimal = validatePreferences({ lat: 12.9716, lon: 77.5946 });
  assert.equal(minimal.ok, true);
  assert.equal(minimal.value.budgetInr, null);
  assert.equal(minimal.value.timeMinutes, null);
});

test('free-text wishes are interpreted by keyword heuristics, clearly labelled', () => {
  const stressed = interpretMoodText('I feel stressed and want somewhere quiet to relax');
  assert.equal(stressed.mood, 'stressed');
  assert.equal(stressed.method, 'keyword-heuristic');
  assert.match(stressed.note, /not a language model/i);
  assert.equal(interpretMoodText('zzzzz'), null);
  assert.equal(interpretMoodText(''), null);
});

test('feedback validation: votes, ratings, comments and OSM keys', () => {
  const good = validateFeedback({ osmKey: 'node/12345', vote: 'like', rating: 5, comment: 'Lovely and quiet.' });
  assert.equal(good.ok, true);
  assert.equal(validateFeedback({ osmKey: 'node/12345', vote: 'love' }).ok, false);
  assert.equal(validateFeedback({ osmKey: 'node/12345', rating: 6 }).ok, false);
  assert.equal(validateFeedback({ osmKey: 'node/12345', rating: 3.5 }).ok, false);
  assert.equal(validateFeedback({ osmKey: 'way/0', vote: 'like' }).ok, false);
  assert.equal(validateFeedback({ osmKey: 'banana', vote: 'like' }).ok, false);
  assert.equal(validateFeedback({ osmKey: 'way/987654', vote: 'like' }).ok, true);
  assert.equal(validateFeedback({ osmKey: 'node/1', comment: 'x'.repeat(LIMITS.COMMENT_MAX + 1) }).ok, false);
  assert.equal(validateFeedback({ osmKey: 'node/1' }).ok, false, 'empty feedback is rejected');
});
