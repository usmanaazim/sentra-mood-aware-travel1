/** Signed-in dashboard: welcome, saved preferences, personalisation summary, map + results. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Clock, Heart, Info, MapPin, SlidersHorizontal, Sparkles, ThumbsDown } from 'lucide-react';
import DiscoveryWorkspace from '../components/DiscoveryWorkspace.jsx';
import { ErrorMessage, LoadingState } from '../components/States.jsx';
import { MOODS } from '../lib/moods.js';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../state/store.jsx';

export default function Dashboard() {
  const { user, handleAuthError } = useAuth();
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = async () => {
    setStatus('loading');
    try {
      const data = await api.profile();
      setProfile(data);
      setStatus('success');
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof ApiError ? err : new ApiError(500, 'error', 'Could not load your dashboard.'));
      setStatus('error');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (status === 'loading') {
    return <div className="container page"><LoadingState title="Loading your dashboard…" message="Fetching your saved preferences and feedback summary." /></div>;
  }
  if (status === 'error') {
    return <div className="container page"><ErrorMessage title="Dashboard unavailable" error={error} onRetry={load} /></div>;
  }

  const savedPrefs = profile?.preferences || null;
  const feedback = profile?.feedback || { total: 0, likes: 0, dislikes: 0, averageRating: null, recent: [] };
  const savedMood = savedPrefs?.mood ? MOODS.find((m) => m.id === savedPrefs.mood) : null;

  const stats = [
    { icon: Heart, label: 'Places liked', value: feedback.likes },
    { icon: ThumbsDown, label: 'Places disliked', value: feedback.dislikes },
    { icon: Brain, label: 'Average rating', value: feedback.averageRating ? `${feedback.averageRating}/5` : '—' },
    { icon: SlidersHorizontal, label: 'Saved preferences', value: savedPrefs?.updatedAt ? 'Saved' : 'Not yet' }
  ];

  return (
    <div className="container">
      <div className="page-hero">
        <p className="eyebrow">Your dashboard</p>
        <h1 style={{ fontSize: 'clamp(1.8rem, 1.3rem + 1.6vw, 2.4rem)' }}>Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p className="lead">
          {savedMood
            ? <>Your saved mood is <strong>{savedMood.emoji} {savedMood.label}</strong> — {savedMood.blurb} Change it any time below.</>
            : <>Pick a mood below to get started. Saved preferences and feedback make later recommendations more personal.</>}
        </p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <span className="row" style={{ gap: 8, color: 'var(--muted)', fontSize: '.82rem' }}>
              <s.icon size={15} aria-hidden="true" /> {s.label}
            </span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>

      {feedback.total > 0 && (
        <div className="alert alert--info" style={{ marginBottom: 20 }}>
          <Info size={18} aria-hidden="true" />
          <div className="small">
            <strong>How your feedback changes rankings.</strong> Liking a place adds up to +6 points, disliking up to −10,
            and ratings shift the score by up to ±4 around 3/5. Feedback applies to <em>your</em> results only and is
            stored per account in SQLite. Showing {feedback.recent.length} of {feedback.total} recent entries on your profile.
          </div>
        </div>
      )}

      {(savedPrefs?.categories?.length > 0 || savedPrefs?.budgetInr != null || savedPrefs?.timeMinutes != null) && (
        <div className="card card--tight" style={{ marginBottom: 20 }}>
          <div className="row" style={{ gap: 18 }}>
            <span className="row" style={{ gap: 6 }}><MapPin size={15} aria-hidden="true" /> Radius <strong>{(savedPrefs.radiusM / 1000).toFixed(1)} km</strong></span>
            <span className="row" style={{ gap: 6 }}><Clock size={15} aria-hidden="true" /> Time <strong>{savedPrefs.timeMinutes ?? '—'} min</strong></span>
            <span className="row" style={{ gap: 6 }}><Sparkles size={15} aria-hidden="true" /> Budget <strong>{Number.isFinite(savedPrefs.budgetInr) ? `₹${savedPrefs.budgetInr}` : '—'}</strong></span>
            <span className="row" style={{ gap: 6 }}>Indoor/outdoor <strong>{savedPrefs.indoorOutdoor}</strong></span>
            <Link to="/profile" className="btn btn--ghost btn--sm btn--auto">Manage in profile</Link>
          </div>
        </div>
      )}

      <DiscoveryWorkspace
        mode="live"
        savedPreferences={savedPrefs ? { ...savedPrefs, latitude: undefined } : null}
      />
    </div>
  );
}
