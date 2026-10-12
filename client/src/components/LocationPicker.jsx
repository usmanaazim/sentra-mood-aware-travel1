/**
 * Location control.
 *
 *   - "Use My Current Location" asks the browser for a live GPS fix
 *     (navigator.geolocation.getCurrentPosition) once per click; the same button
 *     becomes "Refresh Location" afterwards and always requests a NEW fix.
 *   - Nothing is requested until the user presses the button, nothing is
 *     polled, and precise coordinates are never written to the database - they
 *     are kept in component state for the current search only.
 *   - Manual coordinates and example locations stay available as fallbacks and
 *     are labelled as typed/example values, never as a live position.
 */
import { useState } from 'react';
import { Crosshair, Info, MapPin, RefreshCw } from 'lucide-react';
import { GeoError, PRESET_LOCATIONS, formatCoord, getCurrentPosition } from '../lib/geo.js';

const COORD_RE = /^-?\d{1,3}(\.\d+)?$/;

export default function LocationPicker({ location, onChange, onError, disabled = false }) {
  const [status, setStatus] = useState('idle'); // idle | asking | ok | error
  const [error, setError] = useState(null);
  const [manual, setManual] = useState({ lat: '', lon: '' });
  const [showManual, setShowManual] = useState(false);
  const [fixed, setFixed] = useState(null);   // "this fix is fresh" note

  const report = (err) => {
    setError(err);
    setStatus('error');
    onError?.(err);
  };

  const usingGps = location?.source === 'gps';

  const useGps = async ({ refresh = false } = {}) => {
    setStatus('asking');
    setError(null);
    setFixed(null);
    try {
      // maximumAge 0 -> always a fresh fix, never a cached one.
      const pos = await getCurrentPosition({ maximumAge: 0 });
      onChange({ ...pos, label: 'Current GPS Location' });
      setStatus('ok');
      setFixed(refresh ? 'Refreshed from your device just now.' : 'Position read from your device.');
    } catch (err) {
      report(err instanceof GeoError ? err : new GeoError('unavailable', 'Could not read your location.'));
    }
  };

  const applyManual = (e) => {
    e.preventDefault();
    const lat = Number(manual.lat);
    const lon = Number(manual.lon);
    if (!COORD_RE.test(manual.lat.trim()) || !COORD_RE.test(manual.lon.trim()) || Number.isNaN(lat) || Number.isNaN(lon)) {
      report(new GeoError('invalid', 'Enter valid coordinates, e.g. 12.9716 and 77.5946.', 'Latitude is between -90 and 90, longitude between -180 and 180.'));
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      report(new GeoError('range', 'Those coordinates are outside the valid range.', 'Latitude -90…90, longitude -180…180.'));
      return;
    }
    onChange({ lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)), accuracyM: null, source: 'manual', label: 'Manual coordinates' });
    setStatus('ok');
    setError(null);
  };

  const sourceLabel = {
    gps: 'Live GPS',
    manual: 'Manual entry',
    preset: 'Example (fixed coordinates)',
    saved: 'Saved preference'
  }[location?.source] || 'Not set';

  const sourceNote = {
    gps: 'Live device position - requested once per click and never tracked in the background.',
    manual: 'Coordinates you typed. Not from your device, so distances are estimates from that point.',
    preset: 'A fixed example coordinate set. It is not your live position.',
    saved: 'A location you saved earlier in your account preferences.'
  }[location?.source] || '';

  return (
    <div>
      <div className="panel__title"><MapPin size={16} aria-hidden="true" /> Where are you starting from?</div>

      {!location && (
        <p className="hint" style={{ marginBottom: 10 }}>
          Sentra needs a starting point to measure distances. Nothing is requested until you press the button,
          and your exact coordinates are not saved.
        </p>
      )}

      {location && (
        <div className="card card--tight" style={{ marginBottom: 10, background: 'var(--bg-2)' }}>
          <div className="row row--between">
            <div>
              <strong style={{ fontSize: '.9rem' }}>{location.label || 'Selected point'}</strong>
              <div className="mono muted">
                {formatCoord(location.lat)}, {formatCoord(location.lon)}
                {location.accuracyM ? ` · ±${location.accuracyM} m` : ''}
              </div>
            </div>
            <span className={`badge ${usingGps ? 'badge--gps' : 'badge--teal'}`}>{sourceLabel}</span>
          </div>
          {sourceNote && <p className="hint" style={{ margin: '8px 0 0' }}>{sourceNote}</p>}
          {fixed && <p className="hint" style={{ margin: '4px 0 0' }}>{fixed}</p>}
        </div>
      )}

      <button
        type="button"
        className="btn btn--block"
        style={{ marginTop: 10 }}
        onClick={() => useGps({ refresh: usingGps })}
        disabled={disabled || status === 'asking'}
      >
        {status === 'asking'
          ? <><span className="spinner" aria-hidden="true" /> Asking your browser for permission…</>
          : <><Crosshair size={17} aria-hidden="true" /> {usingGps ? 'Refresh Location' : 'Use My Current Location'}</>}
      </button>

      {status === 'asking' && (
        <p className="hint" role="status" aria-live="polite" style={{ marginTop: 8 }}>
          Waiting for your browser to confirm the coordinates…
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn--ghost btn--sm btn--auto" onClick={() => setShowManual((v) => !v)} aria-expanded={showManual}>
          {showManual ? 'Hide manual entry' : 'Enter coordinates manually'}
        </button>
      </div>

      {showManual && (
        <form onSubmit={applyManual} style={{ marginTop: 12 }}>
          <div className="input-group">
            <label className="sr-only" htmlFor="manual-lat">Latitude</label>
            <input id="manual-lat" className="input" inputMode="decimal" placeholder="Latitude e.g. 12.9716"
              value={manual.lat} onChange={(e) => setManual((m) => ({ ...m, lat: e.target.value }))} />
            <label className="sr-only" htmlFor="manual-lon">Longitude</label>
            <input id="manual-lon" className="input" inputMode="decimal" placeholder="Longitude e.g. 77.5946"
              value={manual.lon} onChange={(e) => setManual((m) => ({ ...m, lon: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn--sm btn--auto" style={{ marginTop: 8 }}>Use these coordinates</button>
          <p className="hint" style={{ marginTop: 6 }}>Typed coordinates are used as-is - they are not read from your device.</p>
        </form>
      )}

      <div style={{ marginTop: 12 }}>
        <label className="label" htmlFor="preset-location">Or pick an example location (fixed coordinates)</label>
        <select
          id="preset-location"
          className="select"
          value={location?.presetId || ''}
          disabled={disabled}
          onChange={(e) => {
            const preset = PRESET_LOCATIONS.find((p) => p.id === e.target.value);
            if (!preset) return;
            onChange({ lat: preset.lat, lon: preset.lon, accuracyM: null, source: 'preset', label: preset.label, presetId: preset.id });
            setStatus('ok');
            setError(null);
          }}
        >
          <option value="">Choose a location…</option>
          {PRESET_LOCATIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <p className="hint" style={{ marginTop: 6 }}>
          These are fixed example coordinates used for testing. They are never presented as your own position.
        </p>
      </div>

      {error && (
        <div className="alert alert--warn" style={{ marginTop: 10 }} role="alert">
          <Info size={16} aria-hidden="true" />
          <div>
            <strong>{error.message}</strong>
            {error.hint && <p className="small" style={{ margin: '4px 0 0' }}>{error.hint}</p>}
            <button type="button" className="btn btn--sm btn--secondary btn--auto" style={{ marginTop: 8 }} onClick={() => useGps({ refresh: true })}>
              <RefreshCw size={14} aria-hidden="true" /> Try again
            </button>
          </div>
        </div>
      )}

      <p className="hint" style={{ marginTop: 10 }}>
        Browsers only share location over HTTPS or on localhost, and only after you approve the prompt.
        SENTRA asks once per click and never tracks you continuously. If this page is embedded in a preview
        iframe, the browser may block geolocation - open the app in its own tab and try again.
      </p>
    </div>
  );
}
