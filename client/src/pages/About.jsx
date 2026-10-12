/** About page: what SENTRA is, architecture, scoring, data sources, privacy and limits. */
import { Link } from 'react-router-dom';
import { BarChart3, Compass, Database, Info, Layers, ShieldCheck } from 'lucide-react';
import HowItWorks from '../components/HowItWorks.jsx';
import { MOODS } from '../lib/moods.js';

const WEIGHTS = [
  { label: 'Mood / category compatibility', weight: '50%', detail: 'How well the OpenStreetMap category matches the selected mood (primary 100, secondary 78, neutral 52, discouraged 25).' },
  { label: 'Distance suitability', weight: '30%', detail: '100 at your start point, decaying smoothly to 0 at the radius edge (1 − (d/r)^1.6).' },
  { label: 'Preference compatibility', weight: '20%', detail: 'Selected categories, indoor/outdoor, tagged fees and the wheelchair tag - averaged, never invented.' }
];

export default function About() {
  return (
    <div className="container">
      <div className="page-hero">
        <p className="eyebrow">About the project</p>
        <h1 style={{ fontSize: 'clamp(1.9rem, 1.4rem + 1.8vw, 2.6rem)' }}>SENTRA — mood-aware travel discovery</h1>
        <p className="lead">
          SENTRA (An AI-Driven Mood-Aware Travel Place Recommendation System) is an educational full-stack
          project. It answers a question navigation apps ignore: <em>given how I feel right now, where should I go?</em>
        </p>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="grid grid-2">
          <div className="card">
            <h2 style={{ fontSize: '1.3rem' }}><Compass size={19} aria-hidden="true" style={{ verticalAlign: -3 }} /> The problem</h2>
            <p>
              Map applications are excellent at routing to a destination you already know. They are poor at helping you
              choose a destination in the first place, especially when the deciding factors are how you feel, how much
              time you have and what you can spend.
            </p>
            <p style={{ marginBottom: 0 }}>
              Example: you feel stressed, have two hours and ₹300, and you are in Bengaluru. SENTRA looks for nearby
              parks, gardens, nature reserves and quiet cafes, ranks them with an explained score, and shows them on
              a map with directions into OpenStreetMap.
            </p>
          </div>
          <div className="card">
            <h2 style={{ fontSize: '1.3rem' }}><Layers size={19} aria-hidden="true" style={{ verticalAlign: -3 }} /> Architecture</h2>
            <ul className="small">
              <li><strong>Frontend:</strong> React + Vite, React Router, Leaflet / React Leaflet, one plain CSS stylesheet.</li>
              <li><strong>Backend:</strong> Node.js + Express, better-sqlite3 for users, preferences, feedback and sessions.</li>
              <li><strong>Data:</strong> OpenStreetMap via the public Overpass API (queried server-side, cached 5 minutes).</li>
              <li><strong>Auth:</strong> bcrypt hashing, express-session with a SQLite store, HTTP-only SameSite cookies.</li>
              <li><strong>No paid services:</strong> no Google Maps, no Google Places, no paid AI or auth providers, no API keys.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section section--tint" id="scoring">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Recommendation engine</p>
            <h2>Transparent scoring, not a black box</h2>
            <p className="lead">
              SENTRA ships no trained model. The engine is ordinary, auditable JavaScript that you can read,
              test and change. Every card shows its own breakdown.
            </p>
          </div>
          <div className="grid grid-3">
            {WEIGHTS.map((w) => (
              <div className="card" key={w.label}>
                <span className="feature__icon" aria-hidden="true"><BarChart3 size={20} /></span>
                <h3 style={{ marginTop: 12 }}>{w.label}</h3>
                <span className="score-pill">{w.weight}</span>
                <p className="small" style={{ marginTop: 10 }}>{w.detail}</p>
              </div>
            ))}
          </div>
          <div className="alert alert--info" style={{ marginTop: 20 }}>
            <Info size={18} aria-hidden="true" />
            <div className="small">
              Scores are suitability indicators between 0 and 100, not AI confidence values. Missing data
              (very common in OpenStreetMap) contributes a neutral sub-score rather than an invented one, so an
              unknown price never removes a place from your results.
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Moods &amp; categories</p>
            <h2>Which moods map to which places</h2>
            <p>These pairings are design heuristics for suggestions. They are not medical or scientific claims.</p>
          </div>
          <div className="grid grid-4">
            {MOODS.map((m) => (
              <div className="card card--tight" key={m.id}>
                <span style={{ fontSize: '1.5rem' }} aria-hidden="true">{m.emoji}</span>
                <h3 style={{ fontSize: '1rem', margin: '6px 0 2px' }}>{m.label}</h3>
                <p className="small muted" style={{ margin: 0 }}>{m.blurb}</p>
                <p className="hint" style={{ marginTop: 8 }}>Strong match: {m.match.join(', ')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <HowItWorks withFeatures={false} />

      <section className="section" id="data">
        <div className="container">
          <div className="grid grid-2">
            <div className="card">
              <h2 style={{ fontSize: '1.3rem' }}><Database size={19} aria-hidden="true" style={{ verticalAlign: -3 }} /> Data sources &amp; limits</h2>
              <ul className="small">
                <li>Map tiles: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>.</li>
                <li>Place search: the <strong>public Overpass API</strong>, a community-operated service with no uptime guarantee and fair-use limits.</li>
                <li>SENTRA queries it server-side, caches identical searches for 5 minutes, coalesces concurrent requests and never sets up polling.</li>
                <li>OpenStreetMap rarely contains prices, ratings, visit durations or live opening status - so SENTRA labels those as unavailable.</li>
                <li>Demo mode uses 12 clearly fictional sample records bundled with the app; they are never presented as live results.</li>
              </ul>
            </div>
            <div className="card" id="privacy">
              <h2 style={{ fontSize: '1.3rem' }}><ShieldCheck size={19} aria-hidden="true" style={{ verticalAlign: -3 }} /> Privacy &amp; security posture</h2>
              <ul className="small">
                <li>Passwords: bcrypt hashes, never plaintext, never returned by the API.</li>
                <li>Sessions: HTTP-only + SameSite cookies, regenerated on login, destroyed on logout.</li>
                <li>CSRF: SameSite cookies plus an origin check and a signed double-submit token header.</li>
                <li>Rate limiting on authentication and search endpoints; 64 kB request-body limit.</li>
                <li>Validation and parameterised SQL everywhere; no stack traces in production responses.</li>
                <li>Location is used for the current search only and is not persisted. Logs avoid precise coordinates.</li>
              </ul>
              <p className="small muted" style={{ marginBottom: 0 }}>
                SENTRA is an educational project: it is hardened for development and small deployments, but it does not
                claim to be production-audited. See the README for the production checklist.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Try it now</h2>
            <p className="lead" style={{ margin: '0 auto 20px' }}>
              Demo mode needs no account. Live OpenStreetMap search, saved preferences and feedback need a free account.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link className="btn btn--auto" to="/discover">Discover Your Mood</Link>
              <Link className="btn btn--secondary btn--auto" to="/register">Create an account</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
