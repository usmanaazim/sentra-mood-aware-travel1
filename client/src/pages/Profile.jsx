/** Profile: account details, saved preferences, feedback history, logout. */
import { useEffect, useState } from 'react';
import { LogOut, RefreshCw, Save, Trash2, User, UserCog } from 'lucide-react';
import { ApiError, api } from '../lib/api.js';
import { CATEGORIES, categoryLabel, moodById } from '../lib/moods.js';
import { useAuth, useReviews, useToast } from '../state/store.jsx';
import PreferenceForm, { DEFAULT_PREFS } from '../components/PreferenceForm.jsx';
import MoodSelector from '../components/MoodSelector.jsx';
import { ErrorMessage, LoadingState } from '../components/States.jsx';
import { interpretMoodText } from '../lib/moods.js';

export default function Profile() {
  const { user, logout, handleAuthError } = useAuth();
  const { removeReview, reload } = useReviews();
  const toast = useToast();
  const [tab, setTab] = useState('preferences');
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  const load = async () => {
    setStatus('loading');
    try {
      const data = await api.profile();
      setProfile(data);
      setPrefs({ ...DEFAULT_PREFS, ...(data.preferences || {}) });
      setStatus('success');
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof ApiError ? err : new ApiError(500, 'error', 'Could not load your profile.'));
      setStatus('error');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const data = await api.savePreferences({
        mood: prefs.mood,
        categories: prefs.categories,
        budgetInr: prefs.budgetInr,
        timeMinutes: prefs.timeMinutes,
        radiusM: prefs.radiusM,
        indoorOutdoor: prefs.indoorOutdoor,
        purpose: prefs.purpose,
        accessibility: prefs.accessibility
      });
      toast.success(data?.message || 'Preferences saved.');
      if (data?.notice) toast.info(data.notice);
      setProfile((p) => (p ? { ...p, preferences: data.preferences } : p));
    } catch (err) {
      if (!handleAuthError(err)) toast.error(err instanceof ApiError ? err.message : 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (id) => {
    await removeReview(id);
    await load();
    reload();
  };

  if (status === 'loading') {
    return <div className="container page"><LoadingState title="Loading your profile…" message="Fetching your account, preferences and feedback history." /></div>;
  }
  if (status === 'error') {
    return <div className="container page"><ErrorMessage title="Profile unavailable" error={error} onRetry={load} /></div>;
  }

  const feedback = profile.feedback || { recent: [], total: 0, likes: 0, dislikes: 0, averageRating: null };
  const mood = moodById(profile.preferences?.mood);

  return (
    <div className="container">
      <div className="page-hero">
        <p className="eyebrow">Account</p>
        <h1 style={{ fontSize: 'clamp(1.8rem, 1.3rem + 1.6vw, 2.4rem)' }}>Your Sentra profile</h1>
        <p className="lead">
          Only you can see this data. SENTRA does not store your precise coordinates - location is used for the current
          search only.
        </p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat">
          <span className="row" style={{ gap: 8, color: 'var(--muted)', fontSize: '.82rem' }}><User size={15} aria-hidden="true" /> Name</span>
          <strong style={{ fontSize: '1.05rem' }}>{profile.user.name}</strong>
        </div>
        <div className="stat">
          <span className="row" style={{ gap: 8, color: 'var(--muted)', fontSize: '.82rem' }}>Email</span>
          <strong style={{ fontSize: '1.05rem' }} className="truncate">{profile.user.email}</strong>
        </div>
        <div className="stat">
          <span className="row" style={{ gap: 8, color: 'var(--muted)', fontSize: '.82rem' }}>Member since</span>
          <strong style={{ fontSize: '1.05rem' }}>{profile.user.createdAt ? new Date(profile.user.createdAt).toLocaleDateString() : '—'}</strong>
        </div>
        <div className="stat">
          <span className="row" style={{ gap: 8, color: 'var(--muted)', fontSize: '.82rem' }}>Saved mood</span>
          <strong style={{ fontSize: '1.05rem' }}>{mood ? `${mood.emoji} ${mood.label}` : 'Not set'}</strong>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Profile sections">
        {[['preferences', 'Preferences'], ['feedback', `Feedback (${feedback.total})`], ['account', 'Account']].map(([id, label]) => (
          <button
            key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
            className="tab" type="button" onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'preferences' && (
        <form id="panel-preferences" role="tabpanel" aria-labelledby="tab-preferences" className="card" onSubmit={save}>
          <h2 style={{ fontSize: '1.2rem' }}>Saved discovery preferences</h2>
          <p className="muted small">
            These become the defaults on your dashboard. Location is deliberately not saved.
          </p>
          <div style={{ marginBottom: 20 }}>
            <MoodSelector value={prefs.mood} onChange={(m) => { setPrefs((p) => ({ ...p, mood: m })); setSuggestion(null); }} suggestion={suggestion} onAcceptSuggestion={(m) => setPrefs((p) => ({ ...p, mood: m }))} compact />
          </div>
          <PreferenceForm
            prefs={prefs}
            onChange={setPrefs}
            onInterpret={() => setSuggestion(interpretMoodText(prefs.freeText))}
            interpreting={false}
            disabled={saving}
          />
          {prefs.categories?.length > 0 && (
            <p className="hint">Selected categories: {prefs.categories.map(categoryLabel).join(', ')}</p>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn--auto" disabled={saving}>
              {saving ? <><span className="spinner" aria-hidden="true" /> Saving…</> : <><Save size={16} aria-hidden="true" /> Save preferences</>}
            </button>
            <button type="button" className="btn btn--secondary btn--auto" onClick={load} disabled={saving}>
              <RefreshCw size={16} aria-hidden="true" /> Reload saved values
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Available categories: {CATEGORIES.length}. Unknown categories are rejected by the API.
          </p>
        </form>
      )}

      {tab === 'feedback' && (
        <section id="panel-feedback" role="tabpanel" aria-labelledby="tab-feedback" className="card">
          <h2 style={{ fontSize: '1.2rem' }}>Your feedback history</h2>
          <p className="muted small">
            Likes, dislikes and ratings are stored against your account and used when ranking your own results.
            Entries are limited to 500 per account.
          </p>
          {feedback.recent.length === 0 ? (
            <div className="state">
              <h3>No feedback yet</h3>
              <p>Like, dislike or rate a recommendation on the dashboard and it will appear here.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th scope="col">Place</th><th scope="col">Category</th><th scope="col">Vote</th><th scope="col">Rating</th><th scope="col">Comment</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {feedback.recent.map((f) => (
                    <tr key={f.id}>
                      <td>{f.name || <span className="mono">{f.osmKey}</span>}</td>
                      <td>{f.category ? categoryLabel(f.category) : '—'}</td>
                      <td>{f.vote === 'like' ? '👍 Like' : f.vote === 'dislike' ? '👎 Dislike' : '—'}</td>
                      <td>{f.rating ? `${f.rating}/5` : '—'}</td>
                      <td className="truncate" style={{ maxWidth: 220 }}>{f.comment || '—'}</td>
                      <td>{f.updatedAt ? new Date(`${f.updatedAt}Z`).toLocaleDateString() : '—'}</td>
                      <td>
                        <button type="button" className="btn btn--ghost btn--sm btn--auto" onClick={() => removeEntry(f.id)} aria-label={`Remove feedback for ${f.name || f.osmKey}`}>
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'account' && (
        <section id="panel-account" role="tabpanel" aria-labelledby="tab-account" className="card">
          <h2 style={{ fontSize: '1.2rem' }}><UserCog size={18} aria-hidden="true" style={{ verticalAlign: -3 }} /> Account &amp; security</h2>
          <ul className="small">
            <li>Password is stored as a bcrypt hash - SENTRA can never read it back.</li>
            <li>Your session is held in an HTTP-only, SameSite cookie that JavaScript cannot read.</li>
            <li>Logging out destroys the session server-side and clears the cookie.</li>
            <li>There is no admin panel and no way to view another user's data.</li>
          </ul>
          <button type="button" className="btn btn--danger-soft btn--auto" onClick={logout}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </section>
      )}
    </div>
  );
}
