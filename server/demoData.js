/**
 * SENTRA DEMO DATA - ILLUSTRATIVE ONLY.
 *
 * These 12 records are FICTIONAL sample entries used so the map, scoring and
 * layout remain demonstrable when the public Overpass API is unreachable or
 * rate limited. They are NOT live OpenStreetMap results, they are never stored
 * in the database, and every API response containing them is explicitly tagged
 * `"demo": true` with a visible label in the interface.
 */
export const DEMO_ORIGIN = { lat: 12.9716, lon: 77.5946 };

const r = (osmId, name, category, lat, lon, extra = {}) => ({
  osmType: 'demo',
  osmId,
  osmKey: `demo/${osmId}`,
  name,
  category,
  lat,
  lon,
  address: null,
  openingHours: null,
  website: null,
  phone: null,
  wheelchair: null,
  fee: null,
  cuisine: null,
  outdoorSeating: null,
  metadataSource: 'demo',
  priceEstimate: null,
  priceKnown: false,
  typicalVisitMinutes: null,
  visitDurationKnown: false,
  fictional: true,
  ...extra
});

export const DEMO_PLACES = [
  r(1, 'Demo Lakeview Park (illustrative)', 'park', 12.9762, 77.5993, { fee: 'no', wheelchair: 'yes' }),
  r(2, 'Demo Rose Garden (illustrative)', 'garden', 12.9695, 77.5901, { fee: 'no' }),
  r(3, 'Demo Corner Cafe (illustrative)', 'cafe', 12.9731, 77.6012, { openingHours: 'Mo-Su 08:00-22:00', cuisine: 'coffee_shop' }),
  r(4, 'Demo Heritage Kitchen (illustrative)', 'restaurant', 12.9658, 77.5987, { openingHours: 'Mo-Su 11:00-23:00', cuisine: 'south_indian' }),
  r(5, 'Demo City Museum (illustrative)', 'museum', 12.9751, 77.5932, { fee: 'yes', wheelchair: 'limited' }),
  r(6, 'Demo Skyline Viewpoint (illustrative)', 'viewpoint', 12.9812, 77.5905, {}),
  r(7, 'Demo Children Play Area (illustrative)', 'playground', 12.9669, 77.6041, { fee: 'no' }),
  r(8, 'Demo Splash Water Park (illustrative)', 'water_park', 12.9602, 77.5866, { fee: 'yes' }),
  r(9, 'Demo Urban Nature Reserve (illustrative)', 'nature_reserve', 12.9888, 77.6055, { fee: 'no' }),
  r(10, 'Demo Riverside Promenade (illustrative)', 'attraction', 12.9636, 77.6021, { fee: 'no' }),
  r(11, 'Demo Terrace Bistro (illustrative)', 'restaurant', 12.9725, 77.5869, { outdoorSeating: 'yes', fee: null }),
  r(12, 'Demo Craft Coffee Roastery (illustrative)', 'cafe', 12.9801, 77.5974, { website: 'https://example.invalid/demo-cafe', fee: null })
];

export const DEMO_META = {
  demo: true,
  label: 'DEMO DATA - illustrative sample places, not live OpenStreetMap results',
  generatedAt: 'static',
  count: DEMO_PLACES.length
};
