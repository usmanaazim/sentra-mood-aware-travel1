/** Geolocation, distance helpers and location presets. */

export const EARTH_RADIUS_M = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;

export function haversineMeters(a, b) {
  if (!a || !b) return NaN;
  const lat1 = Number(a.lat); const lon1 = Number(a.lon);
  const lat2 = Number(b.lat); const lon2 = Number(b.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const formatDistance = (m) => {
  if (!Number.isFinite(m)) return 'distance unknown';
  if (m < 950) return `${Math.round(m / 10) * 10} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
};

export const formatCoord = (n) => (Number.isFinite(n) ? n.toFixed(4) : '—');

/** Example / manual locations. Coordinates are real; they are not live results. */
export const PRESET_LOCATIONS = [
  { id: 'bengaluru', label: 'Bengaluru (MG Road)', lat: 12.9716, lon: 77.5946, note: 'Default demo location' },
  { id: 'cubbon', label: 'Cubbon Park, Bengaluru', lat: 12.9763, lon: 77.5929 },
  { id: 'mumbai', label: 'Mumbai (Marine Drive)', lat: 18.9430, lon: 72.8230 },
  { id: 'delhi', label: 'New Delhi (Connaught Place)', lat: 28.6315, lon: 77.2167 },
  { id: 'hampi', label: 'Hampi, Karnataka', lat: 15.3350, lon: 76.4600 },
  { id: 'munnar', label: 'Munnar, Kerala', lat: 10.0889, lon: 77.0595 }
];

export class GeoError extends Error {
  constructor(code, message, hint) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

/**
 * One-shot browser geolocation with explicit, readable failure modes.
 *
 *   - Never called automatically: the caller must be reacting to a user action,
 *     and it is never repeated on a timer (no continuous tracking).
 *   - `maximumAge: 0` means every call asks the device for a *fresh* fix, so the
 *     "Refresh Location" button genuinely re-reads the position instead of
 *     replaying a cached one.
 *   - Requires a secure context: browsers only expose geolocation over HTTPS or
 *     on localhost. A sandboxed preview iframe has an opaque origin and may
 *     refuse permission entirely - that is reported as a normal error.
 */
export function getCurrentPosition({ timeout = 12000, maximumAge = 0, enableHighAccuracy = false } = {}) {
  return new Promise((resolve, reject) => {
    // Some restricted environments expose a partial geolocation object; treat
    // anything without a usable getCurrentPosition as "not supported".
    if (!('geolocation' in navigator) || typeof navigator.geolocation?.getCurrentPosition !== 'function') {
      reject(new GeoError('unsupported', 'This browser does not support location services.', 'Add your location manually, or pick an example location.'));
      return;
    }
    if (!window.isSecureContext) {
      reject(new GeoError('insecure_origin', 'Browsers only share location over HTTPS or on localhost.', 'Open SENTRA over HTTPS, or pick a location manually.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: Number(pos.coords.latitude.toFixed(6)),
        lon: Number(pos.coords.longitude.toFixed(6)),
        accuracyM: Math.round(pos.coords.accuracy || 0),
        source: 'gps'
      }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeoError('denied', 'Location permission was denied.', 'You can still search - choose a location manually or use demo mode.'));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new GeoError('unavailable', 'Your device could not determine a location.', 'Try again outdoors, or enter a location manually.'));
        } else {
          reject(new GeoError('timeout', 'Getting your location timed out.', 'Retry, or pick a location manually.'));
        }
      },
      { enableHighAccuracy, timeout, maximumAge }
    );
  });
}
