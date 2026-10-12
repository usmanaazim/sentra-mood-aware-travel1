/** 404 fallback for unknown routes. */
import { Link, useLocation } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';

export default function NotFound() {
  const location = useLocation();
  return (
    <div className="container">
      <div className="notfound">
        <p className="notfound__code">404</p>
        <h1 style={{ fontSize: '1.8rem' }}>This path does not exist</h1>
        <p className="lead" style={{ margin: '0 auto 24px' }}>
          SENTRA could not find a page at <span className="mono">{location.pathname}</span>.
          Perhaps the mood was for somewhere else.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn--auto" to="/">
            <Home size={17} aria-hidden="true" /> Back home
          </Link>
          <Link className="btn btn--secondary btn--auto" to="/discover">
            <Compass size={17} aria-hidden="true" /> Discover places
          </Link>
          <Link className="btn btn--ghost btn--auto" to="/about">
            <Search size={17} aria-hidden="true" /> About Sentra
          </Link>
        </div>
      </div>
    </div>
  );
}
