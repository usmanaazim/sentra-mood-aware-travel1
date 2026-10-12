/**
 * Minimal error boundary. Used around the Leaflet map so that a failure in the
 * map layer (unsupported browser, blocked library, exotic environment) degrades
 * to a readable notice instead of blanking the whole discovery page.
 */
import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep technical detail on the client console only; the UI stays human-readable.
    console.error('[sentra] component error:', error, info?.componentStack || '');
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="map-wrap" style={{ height: this.props.height || 'var(--map-h)' }}>
        <div className="state state--error" style={{ height: '100%', border: 0, borderRadius: 0 }}>
          <div className="state__icon"><AlertTriangle size={24} aria-hidden="true" /></div>
          <h3>{this.props.title || 'The map could not be displayed'}</h3>
          <p>
            {this.props.message || 'Your browser blocked or does not support the interactive map.'}
            {' '}Recommendations, distances, reasons and OpenStreetMap directions links are unaffected.
          </p>
          <p className="hint">{String(error?.message || error)}</p>
          <button type="button" className="btn btn--secondary btn--auto" onClick={() => this.setState({ error: null })}>
            <RefreshCw size={16} aria-hidden="true" /> Try loading the map again
          </button>
        </div>
      </div>
    );
  }
}
