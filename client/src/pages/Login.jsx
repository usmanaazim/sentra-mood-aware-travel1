/** Login form with validation, loading state and safe return path. */
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Compass, LogIn, ShieldCheck } from 'lucide-react';
import { ApiError } from '../lib/api.js';
import { useAuth } from '../state/store.jsx';
import { ErrorMessage } from '../components/States.jsx';

export default function Login() {
  const { login, sessionNotice, setSessionNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  /** Only allow same-site relative paths, so the login form cannot be used as an open redirect. */
  const nextPath = (() => {
    const raw = new URLSearchParams(location.search).get('next') || location.state?.from || '/dashboard';
    return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
  })();

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await login({ email: form.email, password: form.password });
      setSessionNotice(null);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(500, 'error', 'Unexpected error. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container auth-shell">
      <div className="auth-card card">
        <p className="eyebrow">Welcome back</p>
        <h1 style={{ fontSize: '1.9rem' }}>Sign in to Sentra</h1>
        <p className="muted">Your saved moods, preferences and feedback are waiting.</p>

        {sessionNotice && (
          <div className="alert alert--warn" role="status" style={{ marginBottom: 16 }}>
            <ShieldCheck size={17} aria-hidden="true" />
            <span className="small">{sessionNotice}</span>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 16 }}>
            <ErrorMessage title="Sign in failed" error={error} />
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className="field">
            <label className="label" htmlFor="email">Email address</label>
            <input
              id="email" className="input" type="email" autoComplete="email" required
              value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              aria-invalid={Boolean(error)} placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password" className="input" type="password" autoComplete="current-password" required
              value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              aria-invalid={Boolean(error)} placeholder="Your password"
            />
          </div>
          <button type="submit" className="btn btn--block" disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : <><LogIn size={17} aria-hidden="true" /> Login</>}
          </button>
        </form>

        <p className="hint" style={{ marginTop: 16 }}>
          For safety, SENTRA shows the same message whether or not an email is registered,
          and login attempts are rate limited.
        </p>

        <hr className="divider" />
        <p style={{ margin: 0 }}>
          New here? <Link to={`/register?next=${encodeURIComponent(nextPath)}`}>Create a free account</Link> ·
          {' '}<Link to="/discover">Try demo mode instead</Link>
        </p>
      </div>

      <aside className="auth-aside">
        <Compass size={30} aria-hidden="true" />
        <h2>Mood in. Places out.</h2>
        <p>Sentra turns “I feel stressed and have two hours” into a shortlist of real nearby places, with the reasoning shown for every one.</p>
        <ul>
          <li><ShieldCheck size={17} aria-hidden="true" /> Passwords hashed with bcrypt (work factor configured per environment).</li>
          <li><ShieldCheck size={17} aria-hidden="true" /> Sessions live in HTTP-only, SameSite cookies - never in localStorage.</li>
          <li><ShieldCheck size={17} aria-hidden="true" /> Rate limiting and CSRF tokens protect the API.</li>
          <li><ShieldCheck size={17} aria-hidden="true" /> Only your own feedback and preferences are ever returned to you.</li>
        </ul>
      </aside>
    </div>
  );
}
