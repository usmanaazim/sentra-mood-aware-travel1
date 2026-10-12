/**
 * Single shared Leaflet map (OpenStreetMap tiles). One instance per page.
 * Handles tile failures, radius circle, the start-point marker (a live GPS fix
 * is drawn as a distinct "You are here" marker), place markers and popups.
 *
 * ---------------------------------------------------------------------------
 * Base-map tiles: OpenStreetMap Deutschland / FOSSGIS e.V.
 *   service:      https://tile.openstreetmap.de
 *   usage policy: https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/
 *
 * Why not the OSM Foundation's own tile service (tile.openstreetmap.org)?
 * Its Tile Usage Policy (https://operations.osmfoundation.org/policies/tiles/)
 * requires browser requests to carry a valid HTTP Referer and states that
 * referer-stripped traffic may be blocked without notice. A sandboxed preview
 * iframe has an opaque origin, so no Referer can be sent, and that service
 * answers HTTP 200 with a "403 Access blocked" placeholder image, which Leaflet
 * then paints as every tile. The FOSSGIS service has a documented usage policy
 * that permits embedding on small non-commercial sites and was verified to
 * serve real tiles without a Referer at z8-z19.
 *
 * Attribution below follows the FOSSGIS requirements (ODbL + CC-BY-SA credit
 * and a "report a map issue" link). FOSSGIS additionally asks that the site
 * operator be reachable: set VITE_MAP_CONTACT_EMAIL in client/.env before a
 * public deployment and it is appended to the attribution.
 *
 * Changing provider? Edit THREE places: the URL here, `img-src` in the CSP in
 * server/app.js, and the tile-host assertion in client/test/dom-entry.jsx.
 * ---------------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { categoryEmoji, categoryLabel } from '../lib/moods.js';
import { formatCoord, formatDistance } from '../lib/geo.js';

const TILE_URL = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
const TILE_MAX_ZOOM = 19;
const MAP_CONTACT_EMAIL = import.meta.env.VITE_MAP_CONTACT_EMAIL || '';

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> '
  + '(<a href="https://opendatacommons.org/licenses/odbl/index.html" target="_blank" rel="noopener noreferrer">ODbL</a>) '
  + '&middot; tiles <a href="https://openstreetmap.de/" target="_blank" rel="noopener noreferrer">OpenStreetMap Deutschland</a>/FOSSGIS '
  + '(<a href="https://creativecommons.org/licenses/by-sa/2.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a>) '
  + '&middot; <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">report a map issue</a>'
  + (MAP_CONTACT_EMAIL ? ` &middot; <a href="mailto:${MAP_CONTACT_EMAIL}">map service contact</a>` : '');

const userIcon = (label, { gps = false } = {}) => L.divIcon({
  className: '',
  html: `<div class="user-marker ${gps ? 'user-marker--gps' : ''}" title="${label}"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const placeIcon = (emoji, active) => L.divIcon({
  className: '',
  html: `<div class="pin-marker ${active ? 'pin-marker--active' : ''}"><span>${emoji}</span></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
  popupAnchor: [0, -26]
});

/** Fits the viewport to the results and flies to the selected marker. */
function MapController({ center, results, selectedKey, markerRefs }) {
  const map = useMap();
  const resultKey = useMemo(() => results.map((r) => r.osmKey).join('|'), [results]);

  useEffect(() => {
    if (!center) return;
    if (results.length === 0) {
      map.setView([center.lat, center.lon], 14);
      return;
    }
    const bounds = L.latLngBounds([[center.lat, center.lon], ...results.map((r) => [r.lat, r.lon])]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, center?.lat, center?.lon, resultKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedKey) return;
    const marker = markerRefs.current[selectedKey];
    const place = results.find((r) => r.osmKey === selectedKey);
    if (marker && place) {
      map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
      marker.openPopup();
    }
  }, [selectedKey, map, results, markerRefs]);

  return null;
}

export default function SentraMap({
  center,
  radiusM = 3000,
  results = [],
  selectedKey,
  onSelect,
  onDirections,
  height = 'var(--map-h)',
  emptyMessage = 'No places to show yet. Choose a mood and search.'
}) {
  const [tileError, setTileError] = useState(false);
  const markerRefs = useRef({});

  /** A live GPS fix is labelled "You are here"; anything else is a start point. */
  const isGps = center?.source === 'gps';
  const startLabel = isGps ? 'You are here' : 'Your start point';

  if (!center) {
    return (
      <div className="map-wrap" style={{ height }}>
        <div className="state" style={{ height: '100%', border: 0, borderRadius: 0 }}>
          <h3>Map waiting for a location</h3>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={14}
        scrollWheelZoom
        style={{ height }}
        aria-label="Map of recommended places"
      >
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          maxZoom={TILE_MAX_ZOOM}
          eventHandlers={{ tileerror: () => setTileError(true), load: () => setTileError(false) }}
        />

        {Number.isFinite(radiusM) && (
          <Circle
            center={[center.lat, center.lon]}
            radius={radiusM}
            pathOptions={{ color: '#0e8f86', weight: 1.5, fillColor: '#12a89c', fillOpacity: 0.06, dashArray: '6 6' }}
          />
        )}

        <Marker position={[center.lat, center.lon]} icon={userIcon(startLabel, { gps: isGps })} zIndexOffset={500}>
          <Popup>
            <b>{startLabel}</b>
            <div className="popup-row mono">{formatCoord(center.lat)}, {formatCoord(center.lon)}</div>
            {isGps && center.accuracyM ? <div className="popup-row">Accuracy: ±{center.accuracyM} m (device GPS)</div> : null}
            <div className="popup-row">Search radius: {(radiusM / 1000).toFixed(1)} km</div>
            <div className="popup-row hint">
              {isGps
                ? 'Live position from your device, used for this search only.'
                : 'Example/typed coordinates - not a live position.'}
            </div>
          </Popup>
        </Marker>

        {results.map((place) => (
          <Marker
            key={place.osmKey}
            position={[place.lat, place.lon]}
            icon={placeIcon(categoryEmoji(place.category), selectedKey === place.osmKey)}
            ref={(ref) => { if (ref) markerRefs.current[place.osmKey] = ref; }}
            eventHandlers={{ click: () => onSelect?.(place.osmKey) }}
          >
            <Popup>
              <b>{place.name}</b>
              <div className="popup-row">{categoryLabel(place.category)} · {formatDistance(place.distanceM)}</div>
              <div className="popup-row mono">{formatCoord(place.lat)}, {formatCoord(place.lon)}</div>
              {place.openingHours && <div className="popup-row">Hours metadata: {place.openingHours}</div>}
              <div className="popup-row">{place.priceText || 'Price not available'}</div>
              {Number.isFinite(place.score) && <div className="popup-row">Suitability score: {place.score}/100</div>}
              <div className="popup-actions">
                <button type="button" className="btn btn--sm btn--auto" onClick={() => onSelect?.(place.osmKey)}>Show details</button>
                <button type="button" className="btn btn--sm btn--secondary btn--auto" onClick={() => onDirections?.(place)}>Directions</button>
              </div>
            </Popup>
          </Marker>
        ))}

        <MapController center={center} results={results} selectedKey={selectedKey} markerRefs={markerRefs} />
      </MapContainer>

      {tileError && (
        <div className="map-notice" role="status">
          Some map tiles could not load. Place markers and distances still work - check your connection, then pan the map to retry.
        </div>
      )}

      <div className="map-legend" aria-hidden="true">
        <span><i style={{ background: isGps ? '#0f9d58' : '#1d6ff2' }} />{isGps ? 'You are here (live GPS)' : 'Start point'}</span>
        <span><i style={{ background: '#0e8f86' }} />Recommended place</span>
        <span><i style={{ background: 'rgba(18,168,156,.35)' }} />Search radius</span>
      </div>
    </div>
  );
}
