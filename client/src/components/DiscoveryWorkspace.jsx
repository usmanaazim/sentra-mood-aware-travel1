/**
 * The shared discovery interface used by /discover (demo friendly, public) and
 * /dashboard (signed-in, personalised). Keeps a single map instance, a single
 * preference form and one request pipeline.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Info, LogIn, MapPin, Search, Sparkles } from 'lucide-react';
import { ApiError, api } from '../lib/api.js';
import { PRESET_LOCATIONS, formatDistance } from '../lib/geo.js';
import { interpretMoodText, moodById } from '../lib/moods.js';
import { DEMO_NOTICE, demoPlacesAround } from '../lib/demoPlaces.js';
import { rankDemoPlaces } from '../lib/scoring.js';
import { useAuth, useReviews, useToast } from '../state/store.jsx';
import MoodSelector from './MoodSelector.jsx';
import PreferenceForm, { DEFAULT_PREFS } from './PreferenceForm.jsx';
import LocationPicker from './LocationPicker.jsx';
import SentraMap from './SentraMap.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import RecommendationList from './RecommendationList.jsx';
import { InfoNote } from './States.jsx';

/** Opens OpenStreetMap's own directions interface in a new tab (no in-app navigation). */
export function openDirections(origin, place) {
  const from = `${Number(origin.lat).toFixed(6)},${Number(origin.lon).toFixed(6)}`;
  const to = `${Number(place.lat).toFixed(6)},${Number(place.lon).toFixed(6)}`;
  window.open(
    `https://www.openstreetmap.org/directions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    '_blank',
    'noopener,noreferrer'
  );
}

const DEFAULT_LOCATION = {
  lat: PRESET_LOCATIONS[0].lat,
  lon: PRESET_LOCATIONS[0].lon,
  source: 'preset',
  label: PRESET_LOCATIONS[0].label,
  presetId: PRESET_LOCATIONS[0].id
};

export default function DiscoveryWorkspace({ mode = 'discover', savedPreferences = null, onPreferencesChange }) {
  const { user, handleAuthError } = useAuth();
  const { getReview, saveReview, removeReview, savedByKey } = useReviews();
  const toast = useToast();

  const [prefs, setPrefs] = useState(() => ({
    ...DEFAULT_PREFS,
    ...(savedPreferences || {})
  }));
  const [location, setLocation] = useState(savedPreferences?.lat ? savedPreferences : DEFAULT_LOCATION);
  const [demoMode, setDemoMode] = useState(mode === 'discover' && !user ? true : false);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [interpreting, setInterpreting] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [apiReachable, setApiReachable] = useState(null);
  const runToken = useRef(0);
  const hasResults = useRef(false);   // true once a search has rendered results

  /* ---------------------------- helpers ---------------------------- */
  const effectiveMood = prefs.mood || suggestion?.mood || null;

  const feedbackMap = useMemo(() => {
    const map = {};
    for (const [key, value] of Object.entries(savedByKey || {})) map[key] = { vote: value.vote, rating: value.rating };
    return map;
  }, [savedByKey]);

  useEffect(() => {
    let cancelled = false;
    api.health()
      .then(() => { if (!cancelled) setApiReachable(true); })
      .catch(() => { if (!cancelled) setApiReachable(false); });
    return () => { cancelled = true; };
  }, []);

  /* ------------------------- demo (local) run ----------------------- */
  const runLocalDemo = useCallback((reason = 'demo', at = location) => {
    const demoPlaces = demoPlacesAround(at.lat, at.lon);
    const ranked = rankDemoPlaces({
      places: demoPlaces,
      prefs: { ...prefs, mood: effectiveMood, lat: at.lat, lon: at.lon },
      feedbackByKey: feedbackMap
    });
    hasResults.current = true;
    setResults(ranked);
    setMeta({
      demo: true,
      demoSource: 'client',
      demoNotice: DEMO_NOTICE,
      demoMeta: reason === 'offline'
        ? 'The SENTRA API could not be reached, so the interface is running on bundled illustrative samples.'
        : 'Illustrative samples bundled with the app so the interface can be explored without a working API.',
      mood: effectiveMood ? moodById(effectiveMood) : null,
      radiusM: prefs.radiusM,
      source: 'demo',
      method: 'Rule-based scoring: 50% mood/category compatibility + 30% distance suitability + 20% preference compatibility. No trained machine-learning model is used.'
    });
    setStatus('success');
    setError(null);
  }, [location, prefs, effectiveMood, feedbackMap]);

  /* ---------------------------- live run ---------------------------- */
  const runSearch = useCallback(async ({ useDemo = demoMode, widen = false, at = location } = {}) => {
    const token = ++runToken.current;
    // `at` is passed explicitly by the location handler so the request always
    // carries the coordinates that were just obtained - never the previous ones.
    const payload = {
      ...prefs,
      mood: effectiveMood,
      radiusM: widen ? 5000 : prefs.radiusM,
      lat: at.lat,
      lon: at.lon
    };
    if (widen) setPrefs((p) => ({ ...p, radiusM: 5000 }));

    setSelectedKey(null);

    if (useDemo) {
      setStatus('loading');
      // Brief delay so the loading state is visible and honest about work being done.
      setTimeout(() => { if (runToken.current === token) runLocalDemo('demo', at); }, 180);
      return;
    }

    setStatus('loading');
    setError(null);
    try {
      const data = await api.recommend({ ...payload, demo: false });
      if (runToken.current !== token) return;
      setResults(data.results || []);
      setMeta({
        demo: false,
        source: data.source,
        cached: data.cached,
        fetchedAt: data.fetchedAt,
        radiusM: data.radiusM,
        mood: data.mood,
        method: data.method,
        weights: data.weights,
        excluded: data.excluded,
        feedbackUsed: data.feedbackUsed,
        personalisation: data.personalisation,
        moodSuggestion: data.moodSuggestion
      });
      setApiReachable(true);
      setStatus('success');
      hasResults.current = true;
      if ((data.results || []).length === 0) {
        toast.info('No matches in this radius. Try widening the search or adding categories.');
      }
    } catch (err) {
      if (runToken.current !== token) return;
      handleAuthError(err);
      if (err instanceof ApiError && err.isOffline) setApiReachable(false);
      setError(err);
      setStatus('error');
    }
  }, [prefs, effectiveMood, location, demoMode, runLocalDemo, toast, handleAuthError]);

  /**
   * A new start point (live GPS fix, manual entry or example) must never leave
   * stale results on screen: distances and rankings are recalculated for the new
   * coordinates, and the request is sent with the coordinates just obtained.
   * Only ever triggered by an explicit user action.
   */
  const handleLocationChange = useCallback((next) => {
    setLocation(next);
    setSelectedKey(null);
    if (hasResults.current) runSearch({ at: next });
  }, [runSearch]);

  /* ------------------------- preferences --------------------------- */
  const persistPreferences = async () => {
    if (!user) {
      toast.info('Sign in to save preferences to your account.');
      return;
    }
    setSavingPrefs(true);
    try {
      const data = await api.savePreferences({
        mood: prefs.mood,
        categories: prefs.categories,
        budgetInr: prefs.budgetInr,
        timeMinutes: prefs.timeMinutes,
        radiusM: prefs.radiusM,
        indoorOutdoor: prefs.indoorOutdoor,
        purpose: prefs.purpose,
        accessibility: prefs.accessibility
      });
      toast.success(data?.message || 'Preferences saved.');
      onPreferencesChange?.(data?.preferences || null);
    } catch (err) {
      if (!handleAuthError(err)) toast.error(err instanceof ApiError ? err.message : 'Could not save preferences.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleInterpret = () => {
    setInterpreting(true);
    setTimeout(() => {
      const found = interpretMoodText(prefs.freeText);
      setSuggestion(found);
      setInterpreting(false);
      if (!found) toast.info('No mood keywords recognised. Pick a mood manually - the text is still sent with your search.');
    }, 160);
  };

  const moodLabel = effectiveMood ? moodById(effectiveMood)?.label : '';

  /* ------------------------------ view ------------------------------ */
  const warnings = [];
  if (apiReachable === false && !demoMode) {
    warnings.push('The SENTRA API is not reachable from this browser. Live search needs the backend running on port 4000 - demo mode still works offline.');
  }
  if (demoMode) warnings.push(null);

  return (
    <div className="discover-layout">
      <div className="panel">
        <section className="panel__section" aria-labelledby="mood-heading">
          <div className="panel__title" id="mood-heading"><Sparkles size={16} aria-hidden="true" /> 1 · Your mood</div>
          <MoodSelector
            value={prefs.mood}
            onChange={(mood) => { setPrefs((p) => ({ ...p, mood })); setSuggestion(null); }}
            suggestion={suggestion}
            onAcceptSuggestion={(mood) => { setPrefs((p) => ({ ...p, mood })); setSuggestion(null); }}
          />
        </section>

        <section className="panel__section" aria-labelledby="location-heading">
          <div className="sr-only" id="location-heading">Location</div>
          <LocationPicker
            location={location}
            onChange={handleLocationChange}
            onError={(err) => toast.info(err.message)}
          />
        </section>

        <section className="panel__section" aria-labelledby="prefs-heading">
          <div className="sr-only" id="prefs-heading">Preferences</div>
          <PreferenceForm
            prefs={prefs}
            onChange={setPrefs}
            onInterpret={handleInterpret}
            interpreting={interpreting}
            disabled={status === 'loading'}
          />

          <div className="divider" />

          <label className="checkline" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} />
            <span>
              <strong>Demo mode</strong> — use {DEMO_NOTICE.split('·')[1]?.trim() || 'illustrative sample places'}.
              Recommended if Overpass is busy or you are offline.
            </span>
          </label>

          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button
              type="button" className="btn btn--block"
              onClick={() => runSearch()}
              disabled={status === 'loading' || (!demoMode && !user)}
              title={!demoMode && !user ? 'Sign in for live OpenStreetMap searches, or switch on demo mode.' : undefined}
            >
              {status === 'loading'
                ? <><span className="spinner" aria-hidden="true" /> Searching…</>
                : <><Search size={17} aria-hidden="true" /> Discover places</>}
            </button>
          </div>

          {user && (
            <button type="button" className="btn btn--secondary btn--block" style={{ marginTop: 8 }} onClick={persistPreferences} disabled={savingPrefs}>
              {savingPrefs ? <><span className="spinner spinner--dark" aria-hidden="true" /> Saving…</> : 'Save these preferences'}
            </button>
          )}
        </section>

        {!user && (
          <InfoNote>
            <strong>You are browsing as a visitor.</strong>
            <p className="small" style={{ margin: '4px 0 8px' }}>
              Demo mode works without an account. Live OpenStreetMap searches, saved preferences and
              stored feedback need a free account, which also keeps the public Overpass service protected
              from anonymous bulk use.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn btn--sm btn--auto" to="/register"><Compass size={15} aria-hidden="true" /> Get started</Link>
              <Link className="btn btn--secondary btn--sm btn--auto" to="/login"><LogIn size={15} aria-hidden="true" /> Login</Link>
            </div>
          </InfoNote>
        )}

        {warnings.filter(Boolean).map((w) => (
          <div className="alert alert--warn" key={w} role="status">
            <Info size={16} aria-hidden="true" />
            <span className="small">{w}</span>
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 20 }}>
        <ErrorBoundary>
          <SentraMap
            center={location}
            radiusM={prefs.radiusM}
            results={results}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onDirections={(place) => openDirections(location, place)}
          />
        </ErrorBoundary>

        <div className="card card--tight" style={{ background: 'var(--bg-2)' }}>
          <div className="row" style={{ gap: 16 }}>
            <span className="row" style={{ gap: 6 }}>
              <MapPin size={15} aria-hidden="true" /> Start: <strong>{location.label}</strong>
              {location.source === 'gps'
                ? <span className="badge badge--gps">Live GPS</span>
                : location.source === 'preset'
                  ? <span className="badge">Example location</span>
                  : location.source === 'manual'
                    ? <span className="badge">Manual entry</span>
                    : null}
            </span>
            <span className="row" style={{ gap: 6 }}>
              Radius: <strong>{(prefs.radiusM / 1000).toFixed(1)} km</strong>
            </span>
            <span className="row" style={{ gap: 6 }}>
              Budget: <strong>{Number.isFinite(prefs.budgetInr) ? `₹${prefs.budgetInr}` : 'not set'}</strong>
            </span>
            <span className="row" style={{ gap: 6 }}>
              Time: <strong>{prefs.timeMinutes} min</strong>
            </span>
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Distances are straight-line (Haversine) estimates from your start point to each place{results[0] ? ` - the closest result is ${formatDistance(results[0].distanceM)}` : ''}.
          </p>
        </div>

        <RecommendationList
          status={status}
          results={results}
          error={error}
          meta={meta}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onDirections={(place) => openDirections(location, place)}
          origin={location}
          moodLabel={moodLabel}
          getReview={getReview}
          onSaveReview={saveReview}
          onRemoveReview={removeReview}
          onRetry={() => runSearch()}
          onWiden={() => runSearch({ widen: true })}
          onDemo={() => { setDemoMode(true); runSearch({ useDemo: true }); }}
        />
      </div>
    </div>
  );
}
