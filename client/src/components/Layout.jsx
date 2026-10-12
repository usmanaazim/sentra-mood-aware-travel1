/** App shell: wordmark/logo, navbar with mobile toggle, footer with OSM attribution. */
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Compass, Github, LayoutDashboard, LogOut, Menu, User, X } from 'lucide-react';
import { useAuth } from '../state/store.jsx';
import { Toaster } from './States.jsx';

export function Logo({ compact = false }) {
  return (
    <Link to="/" className="brand" aria-label="SENTRA home">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 8.5A5.5 5.5 0 0 0 13 6c-2.2 0-4 1.1-4 2.8 0 3.4 7.5 2 7.5 5.4 0 1.7-1.8 2.8-4 2.8a5.7 5.7 0 0 1-4.2-1.6" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {!compact && (
        <span>
          SENTRA
          <span className="brand__sub">Mood-aware travel</span>
        </span>
      )}
    </Link>
  );
}

const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'S';

export function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const links = [
    { to: '/', label: 'Home', end: true },
    { to: '/discover', label: 'Discover' },
    { to: '/#how-it-works', label: 'How It Works', hash: true },
    { to: '/about', label: 'About' }
  ];

  const onLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <Logo />
        <nav className={`nav-links ${open ? 'is-open' : ''}`} aria-label="Main navigation">
          {links.map((l) => l.hash ? (
            <Link key={l.to} to={l.to} className="nav-link">{l.label}</Link>
          ) : (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>{l.label}</NavLink>
          ))}
          {user && (
            <>
              <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>Dashboard</NavLink>
              <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>Profile</NavLink>
            </>
          )}
        </nav>

        <div className="navbar__actions">
          {user ? (
            <>
              <Link to="/dashboard" className="btn btn--secondary btn--sm btn--auto" title="Your dashboard">
                <span className="nav-avatar" aria-hidden="true">{initials(user.name)}</span>
                <span className="truncate" style={{ maxWidth: 120 }}>{user.name.split(' ')[0]}</span>
              </Link>
              <button type="button" className="btn btn--ghost btn--sm btn--auto" onClick={onLogout}>
                <LogOut size={16} aria-hidden="true" /> <span className="sr-only-sm">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn--ghost btn--sm btn--auto"><User size={16} aria-hidden="true" /> Login</Link>
              <Link to="/register" className="btn btn--sm btn--auto"><Compass size={16} aria-hidden="true" /> Get Started</Link>
            </>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm nav-toggle btn--auto"
            aria-expanded={open}
            aria-controls="main-navigation"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            <span className="sr-only">Toggle navigation</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div>
            <div className="brand footer__brand" style={{ marginBottom: 12 }}>
              <span className="brand__mark" aria-hidden="true">S</span>
              <span>SENTRA</span>
            </div>
            <p style={{ color: '#b6c5d4', fontSize: '.9rem', maxWidth: '38ch' }}>
              An AI-driven mood-aware travel place recommendation system. SENTRA suggests where to go
              based on how you feel, how much time you have and what you can spend.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link to="/discover">Discover places</Link></li>
              <li><Link to="/dashboard">Dashboard</Link></li>
              <li><Link to="/register">Create an account</Link></li>
              <li><Link to="/about">About the project</Link></li>
            </ul>
          </div>
          <div>
            <h4>Data &amp; docs</h4>
            <ul>
              <li><Link to="/about#data">Data sources</Link></li>
              <li><Link to="/about#privacy">Privacy &amp; location</Link></li>
              <li><a href="https://overpass-api.de/" target="_blank" rel="noopener noreferrer">Overpass API</a></li>
              <li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap copyright</a></li>
            </ul>
          </div>
          <div>
            <h4>Attribution</h4>
            <p style={{ color: '#b6c5d4', fontSize: '.88rem' }}>
              Place data and map tiles: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>,
              available under the Open Database License. Nearby search uses the community-run
              public Overpass API, which offers no uptime guarantee.
            </p>
          </div>
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} SENTRA · Educational project. No Google APIs, no paid keys.</span>
          <span className="row" style={{ gap: 12 }}>
            <span className="badge">Built with React · Leaflet · Express · SQLite</span>
            <a href="https://github.com/" target="_blank" rel="noopener noreferrer" aria-label="Project repository">
              <Github size={18} aria-hidden="true" />
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const location = useLocation();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <Navbar />
      <main id="main" className="page" key={location.pathname}>
        <Outlet />
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}
