/**
 * Nearby-place search against the public Overpass API (OpenStreetMap data).
 *
 * Design notes
 *  - Requests are made ONLY from the server, never from every React component.
 *  - In-memory TTL cache + in-flight request coalescing keeps the community
 *    service from being hammered by identical searches.
 *  - Overpass is a community-operated public service with no uptime guarantee.
 *    Failures are surfaced to the client as structured errors so the UI can
 *    offer retry / clearly-labelled demo mode.
 */
import { config } from './config.js';
import { CATEGORIES, categoryFromTags } from './mood.js';

export const OVERPASS_ERRORS = {
  TIMEOUT: 'timeout',
  RATE_LIMITED: 'rate_limited',
  UPSTREAM_ERROR: 'upstream_error',
  BAD_RESPONSE: 'bad_response',
  NETWORK: 'network'
};

export class OverpassError extends Error {
  constructor(kind, message, status = 502) {
    super(message);
    this.name = 'OverpassError';
    this.kind = kind;
    this.status = status;
  }
}

/** Build the Overpass QL query for the supported categories inside a bbox. */
export function buildOverpassQuery({ lat, lon, radiusM, categories }) {
  const ids = Array.isArray(categories) && categories.length
    ? categories.filter((c) => CATEGORIES[c])
    : Object.keys(CATEGORIES);

  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const bbox = [
    (lat - dLat).toFixed(6),
    (lon - dLon).toFixed(6),
    (lat + dLat).toFixed(6),
    (lon + dLon).toFixed(6)
  ].join(',');

  const parts = [];
  for (const id of ids) {
    for (const { k, v } of CATEGORIES[id].osm) {
      parts.push(`  node["${k}"="${v}"](${bbox});`);
      parts.push(`  way["${k}"="${v}"](${bbox});`);
      parts.push(`  relation["${k}"="${v}"](${bbox});`);
    }
  }

  const timeoutSec = Math.max(5, Math.min(60, Math.round(config.OVERPASS_TIMEOUT_MS / 1000) - 2));
  return `[out:json][timeout:${timeoutSec}];\n(\n${parts.join('\n')}\n);\nout center tags ${config.MAX_RESULTS * 3};`;
}

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Convert one Overpass element into SENTRA's compact place shape. */
export function normalizeElement(el) {
  if (!el || !el.type || !el.id) return null;
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const category = categoryFromTags(tags);
  if (!category) return null;

  const name = clean(tags.name) || clean(tags['name:en']) || null;
  const address = [
    clean(tags['addr:housenumber']),
    clean(tags['addr:street']),
    clean(tags['addr:suburb']),
    clean(tags['addr:city'])
  ].filter(Boolean).join(', ') || null;

  return {
    osmType: el.type,
    osmId: el.id,
    osmKey: `${el.type}/${el.id}`,
    name,
    category,
    lat,
    lon,
    address,
    openingHours: clean(tags.opening_hours) || null,
    website: clean(tags.website) || clean(tags['contact:website']) || null,
    phone: clean(tags.phone) || clean(tags['contact:phone']) || null,
    wheelchair: clean(tags.wheelchair) || null,          // 'yes' | 'no' | 'limited' | undefined
    fee: clean(tags.fee) || null,                        // 'yes' | 'no' - only used when explicitly tagged
    cuisine: clean(tags.cuisine) || null,
    outdoorSeating: clean(tags.outdoor_seating) || null,
    // Provenance: everything above comes from OpenStreetMap tags.
    metadataSource: 'openstreetmap',
    // Fields OpenStreetMap usually does NOT contain. Never fabricated.
    priceEstimate: null,
    priceKnown: false,
    typicalVisitMinutes: null,
    visitDurationKnown: false
  };
}

/** Filter out unusable records and de-duplicate by stable OSM identity. */
export function dedupePlaces(places, limit = config.MAX_RESULTS) {
  const seen = new Map();
  for (const p of places) {
    if (!p || !p.osmKey || !p.name) continue;       // unnamed elements cannot be presented usefully
    const previous = seen.get(p.osmKey);
    // Prefer a record that carries more usable metadata if the same element appears twice.
    if (!previous || (!previous.openingHours && p.openingHours)) seen.set(p.osmKey, p);
  }
  return Array.from(seen.values()).slice(0, limit);
}

// --------------------------- cache + coalescing ----------------------------

/**
 * Place cache factory. Each app instance gets its own cache so tests and
 * multiple server instances in one process never share results.
 */
export function createPlaceCache({ ttlMs = config.PLACES_CACHE_TTL_MS } = {}) {
  const store = new Map();    // key -> { expires, value }
  const inflight = new Map(); // key -> Promise (concurrent-request coalescing)

  return {
    ttlMs,
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() > hit.expires) { store.delete(key); return null; }
      return { ...hit.value, cached: true };
    },
    set(key, value) {
      store.set(key, { expires: Date.now() + ttlMs, value });
      return value;
    },
    getInflight(key) { return inflight.get(key) || null; },
    setInflight(key, promise) { inflight.set(key, promise); },
    clearInflight(key) { inflight.delete(key); },
    clear() { store.clear(); inflight.clear(); },
    get size() { return store.size; }
  };
}

/** Shared default cache used when a caller does not supply one. */
export const defaultPlaceCache = createPlaceCache();

export function cacheKey(lat, lon, radiusM, categories) {
  const cats = [...categories].sort().join('|');
  return `${lat.toFixed(4)},${lon.toFixed(4)},${radiusM},${cats}`;
}

export function clearPlacesCache() { defaultPlaceCache.clear(); }

/** Low-level Overpass call with an explicit timeout and structured errors. */
export async function callOverpass(query, { timeoutMs = config.OVERPASS_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(config.OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        // Public Overpass instances ask for a descriptive User-Agent.
        'User-Agent': config.OVERPASS_USER_AGENT
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new OverpassError(OVERPASS_ERRORS.TIMEOUT, 'The Overpass request timed out.', 504);
    }
    throw new OverpassError(OVERPASS_ERRORS.NETWORK, 'Could not reach the Overpass service.', 502);
  }
  clearTimeout(timer);

  if (response.status === 429) {
    throw new OverpassError(OVERPASS_ERRORS.RATE_LIMITED, 'The Overpass service is rate limiting requests. Please retry shortly.', 429);
  }
  if (response.status === 504) {
    throw new OverpassError(OVERPASS_ERRORS.TIMEOUT, 'The Overpass service timed out running this query.', 504);
  }
  if (!response.ok) {
    throw new OverpassError(OVERPASS_ERRORS.UPSTREAM_ERROR, `Overpass responded with HTTP ${response.status}.`, 502);
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OverpassError(OVERPASS_ERRORS.BAD_RESPONSE, 'Overpass returned a malformed response.', 502);
  }
  if (!json || !Array.isArray(json.elements)) {
    throw new OverpassError(OVERPASS_ERRORS.BAD_RESPONSE, 'Overpass returned an unexpected payload.', 502);
  }
  return json;
}

/**
 * Cached + coalesced nearby search. Concurrent identical requests share one
 * upstream call.
 */
export async function nearbyPlaces({ lat, lon, radiusM, categories = [], fetchImpl = fetch, skipCache = false, cache = defaultPlaceCache }) {
  const key = cacheKey(lat, lon, radiusM, categories);
  if (!skipCache) {
    const cached = cache.get(key);
    if (cached) return cached;
    const pending = cache.getInflight(key);
    if (pending) return pending;   // coalesce identical concurrent searches
  }

  const run = (async () => {
    const query = buildOverpassQuery({ lat, lon, radiusM, categories });
    const data = await callOverpass(query, { fetchImpl });
    const normalized = data.elements.map(normalizeElement).filter(Boolean);
    const places = dedupePlaces(normalized);
    const value = {
      places,
      fetchedAt: new Date().toISOString(),
      elementCount: data.elements.length,
      droppedCount: data.elements.length - places.length,
      endpoint: config.OVERPASS_URL
    };
    cache.set(key, value);
    return { ...value, cached: false };
  })();

  cache.setInflight(key, run);
  try {
    return await run;
  } finally {
    cache.clearInflight(key);
  }
}
