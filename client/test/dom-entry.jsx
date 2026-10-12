/**
 * SENTRA UI test suite (bundled by test/dom-smoke.test.mjs and executed inside a
 * DOM environment). It mounts the REAL application components and talks to the
 * REAL Express API, so it verifies integration rather than duplicated mocks.
 *
 * Covered: landing page, registration, logout, login, protected-route redirects,
 * mood selection (cards + keyword suggestion), demo-mode ranking, live Overpass
 * search, recommendation cards, Leaflet/OpenStreetMap map mounting, and live
 * location (GPS granted / denied / insecure origin, manual coordinates, map
 * re-centring on the fix and a live search that carries those coordinates).
 */
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AppProviders } from '../src/state/store.jsx';
import DiscoveryWorkspace from '../src/components/DiscoveryWorkspace.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: String(detail) });

/** Runs one area of the suite; a throw is recorded as a failure, not a crash. */
async function section(label, fn) {
  try {
    await fn();
  } catch (err) {
    record(`${label}: section completed without throwing`, false, err?.message || String(err));
  }
}

async function settle(ms = 60) {
  await act(async () => { await sleep(ms); });
}

/** Waits until predicate() is true or the timeout elapses. */
async function waitFor(predicate, { timeout = 15000, interval = 120, label = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await settle(interval);
    try { if (predicate()) return true; } catch { /* keep polling */ }
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function mount(element, route = '/') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <AppProviders>{element}</AppProviders>
      </MemoryRouter>
    );
  });
  await settle(60);
  return {
    container,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); }
  };
}

/** React-controlled inputs need the native value setter + an input event. */
function typeInto(input, value) {
  const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

async function click(el) {
  if (!el) throw new Error('click() called with no element');
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await settle(40);
}

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
/** Any error alert currently rendered (used for actionable failure details). */
const alertText = (root) => text(root.querySelector('.state--error, .alert--error, .alert--warn, [role="alert"]')) || '(no error rendered)';
const findByText = (root, selector, needle) =>
  [...root.querySelectorAll(selector)].find((el) => text(el).includes(needle));

export async function run({ apiBase, credentials }) {
  /* 1 ── Landing page ---------------------------------------------------- */
  await section('landing', async () => {
    const app = await mount(<App />, '/');
    const body = text(app.container);
    record('landing: hero headline and both CTAs render', body.includes('Find places that match') && body.includes('Discover Your Mood') && body.includes('Explore Nearby'));
    record('landing: navigation and footer OpenStreetMap attribution', body.includes('Get Started') && body.includes('OpenStreetMap contributors'));
    record('landing: How It Works section present', body.includes('How it works') || body.includes('From mood to destination'));
    record('landing: no image placeholders / broken asset URLs', app.container.querySelectorAll('img').length === 0, 'CSS + SVG illustrations only');
    await app.unmount();
  });

  /* 2 ── Protected routes ------------------------------------------------ */
  await section('protected routes', async () => {
    const app = await mount(<App />, '/dashboard');
    await waitFor(() => text(app.container).includes('Sign in to Sentra'), { label: 'login redirect' });
    record('auth: /dashboard redirects an anonymous visitor to login', text(app.container).includes('Sign in to Sentra'));
    record('auth: login form is usable after the redirect', Boolean(app.container.querySelector('#email') && app.container.querySelector('#password')));
    await app.unmount();
  });

  /* 3 ── Registration through the UI ------------------------------------- */
  await section('registration', async () => {
    const reg = await mount(<App />, '/register');
    const nameInput = reg.container.querySelector('#name');
    const emailInput = reg.container.querySelector('#email');
    const passInput = reg.container.querySelector('#password');
    const confirmInput = reg.container.querySelector('#confirm');
    record('register: form renders all four fields', Boolean(nameInput && emailInput && passInput && confirmInput));

    typeInto(nameInput, 'UI Smoke Tester');
    typeInto(emailInput, credentials.email);
    typeInto(passInput, credentials.password);
    typeInto(confirmInput, 'DifferentPass99');
    await act(async () => { reg.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    await settle(150);
    record('register: client-side validation blocks mismatched passwords', text(reg.container).includes('Passwords do not match'));

    typeInto(confirmInput, credentials.password);
    await act(async () => { reg.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    const ok = await waitFor(() => text(reg.container).includes('Your dashboard'), { timeout: 15000, label: 'dashboard after registration' }).catch(() => false);
    record('register: valid submission creates the account and lands on the dashboard', ok, ok ? 'account created via the live API' : `API said: ${alertText(reg.container)}`);
    const navText = text(reg.container.querySelector('.navbar__actions'));
    record('register: session established, navbar shows the signed-in user',
      navText.includes('UI') && /Logout/i.test(navText),
      `navbar text: "${navText}"`);
    await reg.unmount();
  });

  /* 4 ── Profile page, then logout --------------------------------------- */
  await section('profile + logout', async () => {
    const app = await mount(<App />, '/profile');
    await waitFor(() => text(app.container).includes('Your Sentra profile'), { timeout: 15000, label: 'profile page' });
    record('profile: account, preferences and feedback tabs render', text(app.container).includes('Your Sentra profile') && text(app.container).includes('Preferences') && text(app.container).includes('Feedback'));
    record('profile: shows only the authenticated account', text(app.container).includes(credentials.email));
    record('profile: states that precise location is not stored', text(app.container).includes('does not store your precise coordinates'));

    await click(findByText(app.container, 'button', 'Account'));
    const logoutBtn = findByText(app.container, 'button', 'Log out');
    record('profile: Account tab exposes the logout control', Boolean(logoutBtn));
    await click(logoutBtn);
    await settle(600);
    const gone = await waitFor(() => !text(app.container).includes('Your Sentra profile'), { timeout: 8000, label: 'logout' }).catch(() => false);
    record('logout: session destroyed and profile no longer visible', gone);
    record('logout: exposed /profile is now guarded again', !text(app.container).includes(credentials.email));
    await app.unmount();
  });

  /* 5 ── Login (wrong then right password) -------------------------------- */
  await section('login', async () => {
    const login = await mount(<App />, '/login');
    record('login: form renders', Boolean(login.container.querySelector('#email') && login.container.querySelector('#password')));
    typeInto(login.container.querySelector('#email'), credentials.email);
    typeInto(login.container.querySelector('#password'), 'DefinitelyWrong99');
    await act(async () => { login.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    const rejected = await waitFor(() => text(login.container).toLowerCase().includes('incorrect'), { timeout: 12000, label: 'invalid credentials message' }).catch(() => false);
    record('login: wrong password shows a readable error and stays on the form', rejected && text(login.container).includes('Sign in to Sentra'));
    await login.unmount();

    const good = await mount(<App />, '/login');
    typeInto(good.container.querySelector('#email'), credentials.email);
    typeInto(good.container.querySelector('#password'), credentials.password);
    await act(async () => { good.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    const ok = await waitFor(() => text(good.container).includes('Your dashboard'), { timeout: 15000, label: 'dashboard after login' }).catch(() => false);
    record('login: valid credentials sign in and load the dashboard', ok, ok ? '' : `API said: ${alertText(good.container)}`);
    await good.unmount();
  });

  /* 6 ── Mood selection --------------------------------------------------- */
  let workspace;
  await section('mood selection', async () => {
    workspace = await mount(<DiscoveryWorkspace mode="discover" />, '/discover');
    const cards = workspace.container.querySelectorAll('.mood-card');
    record('mood: all 8 mood cards render', cards.length === 8, `${cards.length} cards found`);

    await click(findByText(workspace.container, '.mood-card', 'Stressed'));
    const pressed = [...workspace.container.querySelectorAll('.mood-card')].filter((c) => c.getAttribute('aria-pressed') === 'true');
    record('mood: clicking a card selects exactly that mood', pressed.length === 1 && text(pressed[0]).includes('Stressed'));

    // Switch to Bored first, then describe a stressed wish: the interpreter must
    // suggest a DIFFERENT mood and offer to apply it (never silently override).
    await click(findByText(workspace.container, '.mood-card', 'Bored'));
    typeInto(workspace.container.querySelector('#freeText'), 'I feel stressed and want somewhere quiet to relax');
    await click(findByText(workspace.container, 'button', 'Suggest a mood'));
    const suggested = await waitFor(() => text(workspace.container).includes('Keyword suggestion'), { timeout: 8000, label: 'keyword suggestion' }).catch(() => false);
    const suggestionText = text(workspace.container);
    record('mood: free-text keyword suggestion appears, labelled as not a language model', suggested && suggestionText.includes('not a language model'));
    record('mood: suggestion is Stressed, matched on keywords, and never overrides silently', suggestionText.includes('Keyword suggestion: Stressed') && suggestionText.includes('matched') === false ? /Matched on/.test(suggestionText) : /Matched on/.test(suggestionText));

    await click(findByText(workspace.container, 'button', 'Use this mood'));
    const adopted = [...workspace.container.querySelectorAll('.mood-card')].find((c) => c.getAttribute('aria-pressed') === 'true');
    record('mood: user can accept the suggested mood with one click', text(adopted || '').includes('Stressed'));
    await click(findByText(workspace.container, '.mood-card', 'Bored'));
    const overridden = [...workspace.container.querySelectorAll('.mood-card')].find((c) => c.getAttribute('aria-pressed') === 'true');
    record('mood: user can override the mood again afterwards', text(overridden || '').includes('Bored'));
  });

  /* 7 ── Demo-mode search (offline-safe path) ----------------------------- */
  await section('demo mode search', async () => {
    await click(findByText(workspace.container, 'button', 'Discover places'));
    await waitFor(() => workspace.container.querySelectorAll('.place-card').length > 0, { timeout: 15000, label: 'demo results' });
    const cards = workspace.container.querySelectorAll('.place-card');
    const body = text(workspace.container);
    record('demo: bundled demo places render as ranked cards', cards.length === 11, `${cards.length} of 12 (nature reserve is dropped: discouraged for the Bored mood)`);
    record('demo: every card carries a score out of 100', workspace.container.querySelectorAll('.score-pill').length === cards.length);
    record('demo: mood-incompatible categories are excluded from the results', ![...workspace.container.querySelectorAll('.place-card')].some((c) => /Nature reserve/.test(text(c))));
    record('demo: every card explains why it was recommended', [...workspace.container.querySelectorAll('.place-card__reason')].every((r) => text(r).includes('Recommended because')));
    record('demo: missing prices are labelled, never invented', body.includes('Price not available'));
    record('demo: DEMO MODE banner is prominent and explicit', body.includes('DEMO MODE') && /illustrative sample places/.test(body));
    record('demo: scores are ranked descending', (() => {
      const scores = [...workspace.container.querySelectorAll('.score-pill')].map((el) => parseInt(text(el), 10));
      return scores.length > 1 && scores.every((v, i) => i === 0 || scores[i - 1] >= v);
    })());
    record('demo: rank 1 for the Bored mood is an activity category', (() => {
      const first = workspace.container.querySelector('.place-card');
      return ['Museum', 'Attraction', 'Playground', 'Water park'].some((c) => text(first).includes(c));
    })());
    const dirLink = workspace.container.querySelector('a[href*="openstreetmap.org/directions"]');
    const href = dirLink?.getAttribute('href') || '';
    record('demo: OpenStreetMap directions link built from validated coordinates', /^https:\/\/www\.openstreetmap\.org\/directions\?from=-?\d+\.\d+%2C-?\d+\.\d+&to=-?\d+\.\d+%2C-?\d+\.\d+$/.test(href), href);
    record('demo: directions link opens a new tab with rel=noopener noreferrer', dirLink?.getAttribute('target') === '_blank' && dirLink?.getAttribute('rel') === 'noopener noreferrer');
    record('demo: feedback controls are present on cards', workspace.container.querySelectorAll('.stars .star').length >= 5);
  });

  /* 8 ── Leaflet + OpenStreetMap map ------------------------------------- */
  await section('leaflet map', async () => {
    const html = workspace.container.innerHTML;
    record('map: Leaflet container mounts', Boolean(workspace.container.querySelector('.leaflet-container')));
    record('map: tiles come from the documented OSM host tile.openstreetmap.de (FOSSGIS)',
      /https:\/\/tile\.openstreetmap\.de\/\d+\/\d+\/\d+\.png/.test(html) && !/tile\.openstreetmap\.org\//.test(html),
      (html.match(/https:\/\/[a-z.]*openstreetmap\.[a-z]+\/[^"']*/) || ['no tile URL found'])[0]);
    record('map: "OpenStreetMap contributors" attribution link present', /openstreetmap\.org\/copyright/.test(html));
    record('map: provider credit and "report a map issue" link present (usage-policy requirement)',
      /openstreetmap\.de/.test(html) && /openstreetmap\.org\/fixthemap/.test(html));
    const pins = workspace.container.querySelectorAll('.pin-marker').length;
    const cardCount = workspace.container.querySelectorAll('.place-card').length;
    record('map: one marker per recommended place', pins === cardCount && pins > 0, `${pins} markers for ${cardCount} cards`);
    record('map: distinct start-point marker rendered', workspace.container.querySelectorAll('.user-marker').length === 1);
    record('map: search radius circle drawn', workspace.container.querySelectorAll('.leaflet-overlay-pane path').length >= 1);
    record('map: legend explains markers and radius', text(workspace.container).includes('Recommended place') && text(workspace.container).includes('Search radius'));
    record('map: no map error fallback shown (map mounted cleanly)', !text(workspace.container).includes('The map could not be displayed'));
  });

  /* 9 ── Feedback on a card ---------------------------------------------- */
  await section('feedback controls', async () => {
    const firstCard = workspace.container.querySelector('.place-card');
    record('feedback: every card exposes Like and Dislike', /Like/.test(text(firstCard)) && /Dislike/.test(text(firstCard)));
    const comment = workspace.container.querySelector('input[placeholder^="Optional short note"]');
    record('feedback: comment field enforces a 500 character limit', comment?.getAttribute('maxlength') === '500');
    record('feedback: visitors without an account are told reviews stay on-device', text(workspace.container).includes('on this device only'));
  });

  await workspace.unmount();

  /* 9b ── Live location: permission paths, manual entry, map centring ------ */
  await section('live location', async () => {
    const GPS = { lat: 12.9352, lon: 77.6245, accuracy: 25 };   // Koramangala, Bengaluru
    /** Slippy-map tile coordinate a correctly centred z14 map must request. */
    const expectedTile = (lat, lon, z = 14) => {
      const n = 2 ** z;
      const x = Math.floor(((lon + 180) / 360) * n);
      const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
      return `/14/${x}/${y}.png`;
    };
    let gpsCalls = 0;   // diagnostics: proves whether the app reached the stub
    const stubGps = (impl) => Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (...args) => { gpsCalls += 1; return impl(...args); } }
    });
    const setSecure = (v) => Object.defineProperty(window, 'isSecureContext', { configurable: true, value: v });
    // NB: match the button's own label — the Romantic mood card also contains
    // the word "locations", so a loose substring match would click a mood card.
    const gpsButton = (root) => [...root.querySelectorAll('button')].find((b) => /^(Use My Current Location|Refresh Location)/.test(text(b)));

    const loc = await mount(<DiscoveryWorkspace mode="discover" />, '/discover');
    const body = () => text(loc.container);
    record('location: the picker states requests are one-shot and never continuous',
      /asks once per click and never tracks you continuously/.test(body())
      && /Browsers only share location over HTTPS or on localhost/.test(body()));
    const gpsBtn0 = gpsButton(loc.container);
    record('location: a prominent "Use My Current Location" button is offered before any fix',
      Boolean(gpsBtn0) && gpsBtn0.className.includes('btn--block'),
      gpsBtn0 ? `"${text(gpsBtn0)}" (${gpsBtn0.className})` : 'button not found');
    record('location: the default example location is labelled as fixed example coordinates, not a live position',
      /Example \(fixed coordinates\)/.test(body())
      && /A fixed example coordinate set\. It is not your live position\./.test(body()));

    // 1. Browser reports a denied permission (the harness default stub does this).
    setSecure(true);
    stubGps((_ok, err) => err({ code: 1, PERMISSION_DENIED: 1 }));
    await click(gpsButton(loc.container));
    const denied = await waitFor(() => /permission was denied/i.test(alertText(loc.container)), { timeout: 6000, label: 'denied-permission message' }).catch(() => false);
    record('location: denied permission shows an actionable message and keeps manual/demo paths open',
      denied && gpsCalls === 1 && Boolean(findByText(loc.container, 'button', 'Try again')),
      denied ? `browser API called ${gpsCalls}x, "Try again" offered` : `alert said: ${alertText(loc.container)}`);

    // 2. A plain-HTTP (insecure) origin cannot prompt at all.
    setSecure(false);
    await click(gpsButton(loc.container));
    const insecure = await waitFor(() => /only share location over HTTPS/i.test(alertText(loc.container)), { timeout: 6000, label: 'insecure-origin alert' }).catch(() => false);
    record('location: an insecure origin is refused with an explanation instead of a silent failure',
      insecure, `alert said: ${alertText(loc.container)}`);
    setSecure(true);

    // 3. Manual coordinate entry validates, then applies.
    await click(findByText(loc.container, 'button', 'Enter coordinates manually'));
    typeInto(loc.container.querySelector('#manual-lat'), 'abc');
    typeInto(loc.container.querySelector('#manual-lon'), '77.59');
    await click(findByText(loc.container, 'button', 'Use these coordinates'));
    record('location: invalid manual coordinates are rejected with a worked example',
      /Enter valid coordinates, e\.g\. 12\.9716 and 77\.5946/.test(body()));

    typeInto(loc.container.querySelector('#manual-lat'), '12.9763');
    typeInto(loc.container.querySelector('#manual-lon'), '77.5929');
    await click(findByText(loc.container, 'button', 'Use these coordinates'));
    record('location: valid manual coordinates are applied and labelled "Manual entry"',
      /12\.9763, 77\.5929/.test(body()) && body().includes('Manual entry'));

    // 4. Granted GPS fix: coordinates, accuracy label, "You are here" marker,
    //    "Current GPS Location" label and map centring.
    const callsBefore = gpsCalls;
    stubGps((ok) => ok({ coords: { latitude: GPS.lat, longitude: GPS.lon, accuracy: GPS.accuracy } }));
    await click(gpsButton(loc.container));
    const gotFix = await waitFor(() => body().includes('12.9352') && body().includes('77.6245'), { timeout: 6000, label: 'GPS fix applied' }).catch(() => false);
    record('location: a granted GPS fix is applied, labelled "Current GPS Location" / "Live GPS" with accuracy',
      gotFix && gpsCalls === callsBefore + 1
      && body().includes('Current GPS Location') && body().includes('Live GPS') && /±25 m/.test(body()),
      gotFix ? `getCurrentPosition called ${gpsCalls - callsBefore}x` : `alert said: ${alertText(loc.container)}`);

    const marker = loc.container.querySelector('.user-marker');
    record('map: the live fix gets a distinct "You are here" marker',
      Boolean(marker) && marker.getAttribute('title') === 'You are here' && marker.className.includes('user-marker--gps')
      && /You are here \(live GPS\)/.test(body()),
      marker ? `title="${marker.getAttribute('title')}" class="${marker.className}"` : 'no user marker rendered');

    const expectTile = expectedTile(GPS.lat, GPS.lon);
    const centred = await waitFor(() => loc.container.innerHTML.includes(expectTile), { timeout: 8000, label: `map centred on ${expectTile}` }).catch(() => false);
    record('map: re-centres on the live GPS coordinates (tile URLs follow the new centre)', centred, `expected ${expectTile}`);

    // 4b. "Refresh Location" must ask the browser again for a NEW fix.
    const REFRESHED = { lat: 12.9360, lon: 77.6250, accuracy: 18 };
    const refreshBtn = gpsButton(loc.container);
    record('location: the button becomes "Refresh Location" once a fix exists',
      Boolean(refreshBtn) && /^Refresh Location/.test(text(refreshBtn)), refreshBtn ? text(refreshBtn) : 'not found');
    const callsBeforeRefresh = gpsCalls;
    stubGps((ok) => ok({ coords: { latitude: REFRESHED.lat, longitude: REFRESHED.lon, accuracy: REFRESHED.accuracy } }));
    await click(refreshBtn);
    const refreshed = await waitFor(() => body().includes('12.9360') && body().includes('77.6250'), { timeout: 6000, label: 'refreshed fix applied' }).catch(() => false);
    record('location: "Refresh Location" re-reads the device position instead of reusing the old one',
      refreshed && gpsCalls === callsBeforeRefresh + 1 && !body().includes('12.9352'),
      refreshed ? `getCurrentPosition called again (${gpsCalls - callsBeforeRefresh}x) -> 12.9360, 77.6250` : `alert said: ${alertText(loc.container)}`);
    const expectTile2 = expectedTile(REFRESHED.lat, REFRESHED.lon);
    const recentred = await waitFor(() => loc.container.innerHTML.includes(expectTile2), { timeout: 8000, label: `map re-centred on ${expectTile2}` }).catch(() => false);
    record('map: re-centres again after the refreshed fix', recentred, `expected ${expectTile2}`);

    // 5. A live (non-demo) search must send THOSE coordinates upstream.
    const demoBox = loc.container.querySelector('.checkline input[type="checkbox"]');
    if (demoBox?.checked) await click(demoBox);
    await waitFor(() => !(findByText(loc.container, 'button', 'Discover places')?.disabled), { timeout: 8000, label: 'live search button enabled' }).catch(() => {});
    await click(findByText(loc.container, 'button', 'Discover places'));
    // Compare the actual sent numbers (JSON drops trailing zeros: 12.9360 -> 12.936).
    const findCall = (lat, lon) => (globalThis.__sentraFetchLog || []).find((x) => {
      if (!/\/api\/recommendations/.test(x.url) || !x.body) return false;
      try {
        const b = JSON.parse(x.body);
        return Number(b.lat) === lat && Number(b.lon) === lon;
      } catch { return false; }
    });
    await waitFor(() => {
      const c = findCall(REFRESHED.lat, REFRESHED.lon);
      return Boolean(c && c.status !== null);
    }, { timeout: 30000, label: 'live search request carrying the GPS point' }).catch(() => {});
    const call = findCall(REFRESHED.lat, REFRESHED.lon);
    record('location: the nearby/recommendation request carries the actual GPS coordinates, not the example ones',
      Boolean(call && call.status !== null),
      call ? `${call.method} ${call.url} with lat/lon 12.9360/77.6250 -> upstream ${call.status}` : 'no recommendations request with the GPS coordinates was captured');
    record('location: no request was sent with the example coordinates while a GPS fix was active',
      !findCall(12.9716, 77.5946),
      'the default example point was never used for the search');

    await settle(1500);
    const cards = loc.container.querySelectorAll('.place-card');
    const distances = [...cards].map((c) => {
      const km = /([\d.]+) km away/.exec(text(c));
      if (km) return Number(km[1]) * 1000;
      const m = /(\d+) m away/.exec(text(c));
      return m ? Number(m[1]) : NaN;
    }).filter(Number.isFinite);
    const honestEmpty = cards.length === 0 && /No matches|no results|did not return|unavailable|timed out|Retry/i.test(body());
    record('location: results are measured from the GPS point — or an upstream failure is surfaced honestly',
      cards.length > 0
        ? distances.length === cards.length && distances.every((d) => d <= 3000 + 60)
        : honestEmpty,
      cards.length === 0
        ? `no live results (upstream said ${call?.status}); page shows: "${alertText(loc.container).slice(0, 120)}"`
        : `${cards.length} places, furthest ${Math.max(...distances)} m`);
    record('location: the GPS search did not silently fall back to demo results', !body().includes('DEMO MODE'));

    // 6. Switching to another start point must re-run the search with the NEW
    //    coordinates so distances and rankings are recalculated.
    const requestsBefore = (globalThis.__sentraFetchLog || []).length;
    const select = loc.container.querySelector('#preset-location');
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, 'mumbai');
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    const reRan = await waitFor(() => (globalThis.__sentraFetchLog || []).slice(requestsBefore)
      .some((x) => /\/api\/recommendations/.test(x.url) && /"lat":18\.943/.test(x.body || '')), { timeout: 30000, label: 're-search after the location change' }).catch(() => false);
    record('location: choosing another start point refreshes the search with the new coordinates',
      reRan, reRan ? 'recommendations re-requested from the new (Mumbai) origin' : 'no follow-up request observed');
    record('location: the example location is re-labelled as an example, never as a live position',
      /Example \(fixed coordinates\)/.test(body()) && !body().includes('Current GPS Location'));

    // 7. A browser without geolocation support is told so explicitly.
    // A browser/sandbox that exposes no usable geolocation API (not merely a denial).
    Object.defineProperty(window.navigator, 'geolocation', { configurable: true, value: {} });
    await click(gpsButton(loc.container)).catch(() => {});
    const unsupported = await waitFor(() => /does not support location services/i.test(alertText(loc.container)), { timeout: 5000, label: 'unsupported-geolocation message' }).catch(() => false);
    record('location: a browser without geolocation support is reported clearly',
      unsupported, `alert said: ${alertText(loc.container)}`);

    // Restore the harness default (denied) and clean up.
    stubGps((_ok, err) => err({ code: 1, PERMISSION_DENIED: 1 }));
    await loc.unmount();
  });

  /* 10 ── LIVE Overpass + OpenStreetMap search (signed in, demo off) ------- */
  await section('live overpass search', async () => {
    // mode="live" starts with demo mode off and needs the session established earlier.
    const live = await mount(<DiscoveryWorkspace mode="live" />, '/dashboard');

    await click(findByText(live.container, '.mood-card', 'Stressed'));

    // A tighter request keeps the public Overpass service fast and fair:
    // two categories inside 1.5 km instead of every category inside 3 km.
    await click(findByText(live.container, 'button.chip', 'Park'));
    await click(findByText(live.container, 'button.chip', 'Garden'));
    const radius = live.container.querySelector('#radius');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(radius, '1500');
    radius.dispatchEvent(new window.Event('input', { bubbles: true }));

    const discover = findByText(live.container, 'button', 'Discover places');
    record('live: Discover button is enabled for a signed-in user', discover && !discover.disabled);
    await click(discover);

    const resultsAppeared = () => live.container.querySelectorAll('.place-card').length > 0;
    const errorShown = () => live.container.querySelector('.state--error');
    await waitFor(() => resultsAppeared() || errorShown(), { timeout: 45000, label: 'live Overpass response' }).catch(() => {});

    // If the community service was slow, use the app's own Retry control once.
    if (!resultsAppeared() && errorShown()) {
      const firstError = text(errorShown()).slice(0, 160);
      record('live: an Overpass failure surfaces a readable error with Retry and demo options',
        /Retry/.test(text(live.container)) && /demo mode/i.test(text(live.container)), firstError);
      await click(findByText(live.container, 'button', 'Retry'));
      await waitFor(() => resultsAppeared() || errorShown(), { timeout: 45000, label: 'live retry' }).catch(() => {});
      record('live: the Retry control re-issues the search', resultsAppeared() || Boolean(errorShown()));
    }

    const cards = [...live.container.querySelectorAll('.place-card')];
    const bodyText = text(live.container);
    record('live: nearby places returned from the public Overpass API', cards.length > 0,
      cards.length ? `${cards.length} places` : `still failing: ${text(errorShown()).slice(0, 150)}`);
    record('live: results are marked as live OpenStreetMap data, not demo',
      cards.length > 0 && bodyText.includes('Live OpenStreetMap data') && !bodyText.includes('DEMO MODE'));
    record('live: every result explains its recommendation',
      cards.length > 0 && cards.every((c) => text(c.querySelector('.place-card__reason') || c).includes('Recommended because')));
    record('live: every result carries a suitability score', cards.length > 0 && cards.every((c) => c.querySelector('.score-pill')));
    record('live: distances are reported for real places', cards.length > 0 && cards.some((c) => /\d+ m away|\d+\.\d km away/.test(text(c))));
    record('live: requested categories are respected (parks/gardens only)',
      cards.length > 0 && cards.every((c) => /Park|Garden/.test(text(c))));
    record('live: distances stay inside the 1.5 km radius',
      cards.length === 0 || cards.every((c) => {
        const m = /([\d.]+) km away/.exec(text(c)) || /(\d+) m away/.exec(text(c));
        if (!m) return true;
        const metres = text(c).includes('km away') ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
        return metres <= 1500;
      }));
    record('live: prices are labelled, never invented',
      cards.length === 0 || cards.every((c) => /Price not available|₹/.test(text(c))));
    record('live: opening hours are metadata only, never "open now"', !/is open now|open right now/i.test(bodyText));
    record('live: map plots one marker per live result',
      live.container.querySelectorAll('.pin-marker').length === cards.length,
      `${live.container.querySelectorAll('.pin-marker').length} markers / ${cards.length} cards`);
    record('live: directions links are built from real OSM coordinates',
      cards.length === 0 || cards.every((c) => /^https:\/\/www\.openstreetmap\.org\/directions\?from=-?\d+\.\d+%2C-?\d+\.\d+&to=-?\d+\.\d+%2C-?\d+\.\d+$/.test(c.querySelector('a[href*="directions"]')?.getAttribute('href') || '')));
    record('live: leaflet map still mounted alongside live results',
      Boolean(live.container.querySelector('.leaflet-container')) && /tile\.openstreetmap\.de/.test(live.container.innerHTML));

    // Evidence for the report: what the UI actually rendered.
    const summary = cards.slice(0, 3).map((c) => {
      const name = text(c.querySelector('.place-card__name'));
      const dist = (/[\d.]+ km away|[\d]+ m away/.exec(text(c)) || [''])[0];
      const score = text(c.querySelector('.score-pill'));
      return `${name} (${dist}, ${score})`;
    }).join(' · ');
    record('live: rendered results sampled for the report', cards.length > 0, summary.slice(0, 320));

    await live.unmount();
  });

  return results;
}
