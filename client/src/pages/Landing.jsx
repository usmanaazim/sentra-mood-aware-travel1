/** Public landing page: hero, CSS map preview, how it works, features, privacy. */
import { Link } from 'react-router-dom';
import { ArrowRight, Compass, Eye, Lock, MapPin, Navigation2, ShieldCheck, Sparkles } from 'lucide-react';
import HowItWorks from '../components/HowItWorks.jsx';
import { useAuth } from '../state/store.jsx';

const PREVIEW_PINS = [
  { top: '26%', left: '30%', label: 'Quiet garden · 0.4 km', emoji: '🌷' },
  { top: '58%', left: '62%', label: 'Lakeview park · 1.1 km', emoji: '🌳' },
  { top: '76%', left: '24%', label: 'Corner cafe · 0.8 km', emoji: '☕' }
];

const PREVIEW_LIST = [
  { emoji: '🌷', name: 'Botanical Garden', meta: 'Garden · 400 m · score 92' },
  { emoji: '🌳', name: 'Lakeview Park', meta: 'Park · 1.1 km · score 88' },
  { emoji: '☕', name: 'Corner Cafe', meta: 'Cafe · 800 m · score 74' }
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <div>
            <span className="badge badge--teal"><Sparkles size={13} aria-hidden="true" /> Mood-aware discovery · OpenStreetMap powered</span>
            <h1 style={{ marginTop: 16 }}>Find places that match <em>your mood</em>.</h1>
            <p className="lead">
              Navigation apps get you to a destination you already chose. SENTRA starts one step earlier:
              tell it how you feel, how long you have and what you can spend, and it scores real nearby
              places - parks, gardens, cafes, museums, viewpoints - then explains every suggestion.
            </p>
            <div className="hero__cta">
              <Link className="btn btn--auto" to={user ? '/dashboard' : '/discover'}>
                <Compass size={18} aria-hidden="true" /> Discover Your Mood
              </Link>
              <Link className="btn btn--secondary btn--auto" to="/discover">
                <MapPin size={18} aria-hidden="true" /> Explore Nearby
              </Link>
            </div>
            <div className="hero__stats">
              <div className="hero__stat"><strong>8 moods</strong><span>Mapped to place categories</span></div>
              <div className="hero__stat"><strong>10 categories</strong><span>Parks to viewpoints, from OSM</span></div>
              <div className="hero__stat"><strong>500 m – 5 km</strong><span>Radius you control</span></div>
            </div>
          </div>

          <div className="hero__panel">
            <div className="preview" aria-hidden="true">
              <div className="preview__bar">
                <span className="preview__dots"><i /><i /><i /></span>
                <span className="small muted">sentra · calm mood · 3 km · ₹300</span>
              </div>
              <div className="preview__map">
                <span className="preview__green" />
                <span className="preview__water" />
                <span className="preview__road preview__road--a" />
                <span className="preview__road preview__road--b" />
                <span className="pin pin--user" style={{ top: '46%', left: '48%' }}>
                  <span className="pin__bubble">You</span>
                  <span className="pin__dot" />
                </span>
                {PREVIEW_PINS.map((p) => (
                  <span className="pin" key={p.label} style={{ top: p.top, left: p.left }}>
                    <span className="pin__bubble">{p.emoji} {p.label}</span>
                    <span className="pin__dot" />
                  </span>
                ))}
              </div>
              <div className="preview__list">
                {PREVIEW_LIST.map((item) => (
                  <div className="preview__item" key={item.name}>
                    <span className="preview__emoji" aria-hidden="true">{item.emoji}</span>
                    <span>
                      <b>{item.name}</b>
                      <span>{item.meta}</span>
                    </span>
                    <span className="spacer" />
                    <Navigation2 size={16} style={{ color: 'var(--muted)' }} />
                  </div>
                ))}
                <p className="hint" style={{ margin: 0 }}>
                  Interface preview with illustrative samples - real results come from OpenStreetMap.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />

      <section className="section" id="privacy">
        <div className="container">
          <div className="grid grid-2">
            <div className="card">
              <span className="feature__icon" aria-hidden="true"><Lock size={20} /></span>
              <h2 style={{ fontSize: '1.35rem', marginTop: 12 }}>Privacy &amp; location</h2>
              <ul>
                <li><strong>Location is requested only when you press the button</strong> - never on page load, and never continuously.</li>
                <li>Your coordinates are used to query nearby places and are <strong>not stored in the SENTRA database</strong>.</li>
                <li>Sessions use an HTTP-only cookie. Passwords are hashed with bcrypt. No tokens are kept in localStorage.</li>
                <li>Feedback is linked to your account only, and only your own entries are visible to you.</li>
                <li>Browsers only share location over HTTPS or on localhost — on insecure origins SENTRA offers manual entry instead.</li>
              </ul>
              <Link className="btn btn--secondary btn--sm btn--auto" to="/about#privacy">
                <Eye size={15} aria-hidden="true" /> Read the privacy notes
              </Link>
            </div>
            <div className="card">
              <span className="feature__icon" aria-hidden="true"><ShieldCheck size={20} /></span>
              <h2 style={{ fontSize: '1.35rem', marginTop: 12 }}>Honest by design</h2>
              <ul>
                <li>Scores come from a <strong>transparent rule-based engine</strong> in plain JavaScript: 50% mood fit, 30% distance, 20% preferences. No trained model is claimed.</li>
                <li>OpenStreetMap usually has no prices, ratings or visit durations, so SENTRA shows <strong>“Price not available”</strong> instead of inventing numbers.</li>
                <li>Opening-hours tags are displayed as metadata - SENTRA does not claim a place is open right now.</li>
                <li>If the public Overpass API is unavailable, you get a clear error plus a <strong>labelled demo mode</strong> - never silently swapped data.</li>
                <li>Directions open in OpenStreetMap's own interface; SENTRA does not pretend to offer turn-by-turn navigation.</li>
              </ul>
              <Link className="btn btn--secondary btn--sm btn--auto" to="/about">
                <ArrowRight size={15} aria-hidden="true" /> How the engine works
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
