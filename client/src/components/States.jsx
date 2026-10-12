/** Loading, error, empty and demo states + skeletons, reused across pages. */
import { AlertTriangle, Compass, Info, Loader2, MapPinned, RefreshCw, Search, WifiOff } from 'lucide-react';
import { useToast } from '../state/store.jsx';

export function Spinner({ dark = false, label = 'Loading' }) {
  return (
    <span role="status" aria-label={label} style={{ display: 'inline-flex' }}>
      <span className={dark ? 'spinner spinner--dark' : 'spinner'} />
    </span>
  );
}

export function LoadingState({ title = 'Finding places for your mood…', message = 'Querying the public Overpass API for nearby OpenStreetMap features.' }) {
  return (
    <div className="state" aria-live="polite">
      <div className="state__icon"><Loader2 className="spin" size={24} aria-hidden="true" /></div>
      <h3>{title}</h3>
      <p className="small">{message}</p>
      <div className="stack" style={{ width: '100%', marginTop: 8 }}>
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 68, width: '100%' }} />)}
      </div>
    </div>
  );
}

export function RecommendationSkeleton() {
  return (
    <div className="place-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton" style={{ height: 18, width: '45%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 12, width: '70%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 52, width: '100%' }} />
        </div>
      ))}
    </div>
  );
}

export function ErrorMessage({ title = 'Something went wrong', error, onRetry, onDemo, children }) {
  const details = error?.details || [];
  return (
    <div className="state state--error" role="alert">
      <div className="state__icon"><AlertTriangle size={24} aria-hidden="true" /></div>
      <h3>{title}</h3>
      <p>{error?.message || 'The request could not be completed.'}</p>
      {error?.hint && <p className="small">{error.hint}</p>}
      {details.length > 0 && (
        <ul className="small" style={{ textAlign: 'left' }}>
          {details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
      {children}
      <div className="row" style={{ justifyContent: 'center' }}>
        {onRetry && (
          <button type="button" className="btn btn--auto" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" /> Retry
          </button>
        )}
        {onDemo && (
          <button type="button" className="btn btn--secondary btn--auto" onClick={onDemo}>
            <Compass size={16} aria-hidden="true" /> Use demo mode
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title = 'No places matched', message, onWiden, onDemo, children }) {
  return (
    <div className="state">
      <div className="state__icon"><Search size={24} aria-hidden="true" /></div>
      <h3>{title}</h3>
      <p>{message || 'Nothing in OpenStreetMap matched this mood, category and radius. Try a larger radius, or choose more categories.'}</p>
      {children}
      <div className="row" style={{ justifyContent: 'center' }}>
        {onWiden && <button type="button" className="btn btn--auto" onClick={onWiden}><RefreshCw size={16} aria-hidden="true" /> Widen radius to 5 km</button>}
        {onDemo && <button type="button" className="btn btn--secondary btn--auto" onClick={onDemo}><Compass size={16} aria-hidden="true" /> Preview with demo data</button>}
      </div>
    </div>
  );
}

export function DemoBanner({ notice, source = 'client', meta }) {
  return (
    <div className="state state--demo" role="status" style={{ padding: '14px 16px', flexDirection: 'row', textAlign: 'left', alignItems: 'flex-start', gap: 12 }}>
      <div className="state__icon" style={{ width: 40, height: 40, background: '#ffeec2', color: 'var(--amber-ink)' }}>
        <MapPinned size={20} aria-hidden="true" />
      </div>
      <div>
        <strong className="badge badge--demo">DEMO MODE</strong>
        <p className="small" style={{ margin: '6px 0 0' }}>
          {notice || 'These are illustrative sample places, not live OpenStreetMap results.'}
        </p>
        {meta && <p className="small muted" style={{ margin: '4px 0 0' }}>{meta}</p>}
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          {source === 'client'
            ? 'Ranked on your device with the same documented scoring rules the server uses.'
            : 'Served by the SENTRA API demo endpoint.'}
        </p>
      </div>
    </div>
  );
}

export function OfflineNotice({ onRetry }) {
  return (
    <div className="alert alert--warn" role="status">
      <WifiOff size={18} aria-hidden="true" />
      <div>
        <strong>SENTRA API not reachable.</strong>
        <p className="small" style={{ margin: '4px 0 0' }}>
          Live search needs the backend on port 4000. Demo mode still works entirely in your browser.
        </p>
        {onRetry && <button type="button" className="btn btn--sm btn--secondary" style={{ marginTop: 8 }} onClick={onRetry}>Check again</button>}
      </div>
    </div>
  );
}

export function InfoNote({ children, tone = 'info' }) {
  return (
    <div className={`alert alert--${tone}`}>
      <Info size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} role="status">
          <span>{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">✕</button>
        </div>
      ))}
    </div>
  );
}
