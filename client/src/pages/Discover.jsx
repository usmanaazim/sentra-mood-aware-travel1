/** Public discovery page. Demo mode open to everyone, live search needs an account. */
import { Compass, Info } from 'lucide-react';
import DiscoveryWorkspace from '../components/DiscoveryWorkspace.jsx';
import { useAuth } from '../state/store.jsx';

export default function Discover() {
  const { user } = useAuth();
  return (
    <div className="container">
      <div className="page-hero">
        <div className="row row--between">
          <div>
            <p className="eyebrow">{user ? `Signed in as ${user.name.split(' ')[0]}` : 'Visitor mode'}</p>
            <h1 style={{ fontSize: 'clamp(1.8rem, 1.3rem + 1.6vw, 2.4rem)' }}>Discover places for your mood</h1>
            <p className="lead">
              Choose how you feel, set your budget and time, then let Sentra rank real nearby places
              from OpenStreetMap - each with the reason it was suggested.
            </p>
          </div>
          <span className="badge badge--teal" style={{ alignSelf: 'flex-start' }}>
            <Compass size={14} aria-hidden="true" /> {user ? 'Live + demo modes' : 'Demo mode available'}
          </span>
        </div>
      </div>

      <div className="alert alert--info" style={{ marginBottom: 20 }}>
        <Info size={18} aria-hidden="true" />
        <div className="small">
          Places, opening-hours tags and coordinates come from <strong>OpenStreetMap</strong> through the community-run
          public Overpass API. SENTRA adds the mood scoring, distance maths and explanations - and clearly labels
          anything it cannot verify, such as prices.
        </div>
      </div>

      <DiscoveryWorkspace mode={user ? 'live' : 'discover'} />
    </div>
  );
}
