/** Registration form: client-side validation mirrors the server rules. */
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Compass, UserPlus } from 'lucide-react';
import { ApiError } from '../lib/api.js';
import { useAuth } from '../state/store.jsx';
import { ErrorMessage } from '../components/States.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const nextPath = (() => {
    const raw = new URLSearchParams(location.search).get('next');
    return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
  })();

  const clientErrors = useMemo(() => {
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Please enter your full name.';
    if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Enter a valid email address.';
    if (form.password.length < 8) {
      errs.password = 'Use at least 8 characters.';
    } else {
      const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(form.password)).length;
      if (variety < 2) errs.password = 'Mix at least two of: lowercase, uppercase, numbers, symbols.';
    }
    if (form.confirmPassword !== form.password) errs.confirmPassword = 'Passwords do not match.';
    return errs;
  }, [form]);

  const strength = useMemo(() => {
    const p = form.password;
    if (!p) return { level: 0, label: 'Empty' };
    let score = 0;
    if (p.length >= 8) score += 1;
    if (p.length >= 12) score += 1;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score += 1;
    if (/[0-9]/.test(p)) score += 1;
    if (/[^A-Za-z0-9]/.test(p)) score += 1;
    const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    return { level: score, label: labels[score] };
  }, [form.password]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setTouched({ name: true, email: true, password: true, confirmPassword: true });
    if (Object.keys(clientErrors).length) return;
    setError(null);
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword
      });
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(500, 'error', 'Unexpected error. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (key) => (touched[key] ? clientErrors[key] : null);

  return (
    <div className="container auth-shell">
      <div className="auth-card card">
        <p className="eyebrow">Create your account</p>
        <h1 style={{ fontSize: '1.9rem' }}>Start discovering by mood</h1>
        <p className="muted">Free, no card, and your location is never stored.</p>

        {error && (
          <div style={{ marginBottom: 16 }}>
            <ErrorMessage title="Registration could not be completed" error={error} />
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className="field">
            <label className="label" htmlFor="name">Full name</label>
            <input
              id="name" className={`input ${fieldError('name') ? 'input--invalid' : ''}`} autoComplete="name" required
              value={form.name} onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              aria-invalid={Boolean(fieldError('name'))} aria-describedby={fieldError('name') ? 'name-error' : undefined}
              placeholder="e.g. Asha Rao"
            />
            {fieldError('name') && <p className="hint" id="name-error" style={{ color: 'var(--danger)' }}>{fieldError('name')}</p>}
          </div>

          <div className="field">
            <label className="label" htmlFor="email">Email address</label>
            <input
              id="email" className={`input ${fieldError('email') ? 'input--invalid' : ''}`} type="email" autoComplete="email" required
              value={form.email} onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              aria-invalid={Boolean(fieldError('email'))} aria-describedby={fieldError('email') ? 'email-error' : undefined}
              placeholder="you@example.com"
            />
            {fieldError('email') && <p className="hint" id="email-error" style={{ color: 'var(--danger)' }}>{fieldError('email')}</p>}
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password" className={`input ${fieldError('password') ? 'input--invalid' : ''}`} type="password" autoComplete="new-password" required
              value={form.password} onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              aria-invalid={Boolean(fieldError('password'))} aria-describedby="password-hint"
              placeholder="At least 8 characters"
            />
            <div className="range-row" style={{ gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${(strength.level / 5) * 100}%`, height: '100%',
                  background: strength.level >= 4 ? 'var(--emerald)' : strength.level >= 2 ? '#e0a300' : 'var(--danger)',
                  transition: 'width .2s ease'
                }} />
              </div>
              <span className="hint" style={{ margin: 0 }}>{strength.label}</span>
            </div>
            <p className="hint" id="password-hint">Minimum 8 characters, mixing at least two character types.</p>
            {fieldError('password') && <p className="hint" style={{ color: 'var(--danger)' }}>{fieldError('password')}</p>}
          </div>

          <div className="field">
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm" className={`input ${fieldError('confirmPassword') ? 'input--invalid' : ''}`} type="password" autoComplete="new-password" required
              value={form.confirmPassword} onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              aria-invalid={Boolean(fieldError('confirmPassword'))}
              placeholder="Repeat your password"
            />
            {fieldError('confirmPassword') && <p className="hint" style={{ color: 'var(--danger)' }}>{fieldError('confirmPassword')}</p>}
          </div>

          <button type="submit" className="btn btn--block" disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" /> Creating account…</> : <><UserPlus size={17} aria-hidden="true" /> Create account</>}
          </button>
        </form>

        <hr className="divider" />
        <p style={{ margin: 0 }}>
          Already registered? <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link> ·
          {' '}<Link to="/discover">Try demo mode</Link>
        </p>
      </div>

      <aside className="auth-aside">
        <Compass size={30} aria-hidden="true" />
        <h2>What you get</h2>
        <ul>
          <li><Check size={17} aria-hidden="true" /> Live nearby searches against OpenStreetMap via Overpass.</li>
          <li><Check size={17} aria-hidden="true" /> Saved mood, budget, time and radius preferences.</li>
          <li><Check size={17} aria-hidden="true" /> Feedback (likes, dislikes, ratings) stored in SQLite and used to tune your own ranking.</li>
          <li><Check size={17} aria-hidden="true" /> An explainable score breakdown on every suggestion.</li>
        </ul>
        <p className="small" style={{ color: '#e9fffb' }}>
          SENTRA never stores your precise coordinates, never shows other users' data, and never requires a paid API key.
        </p>
      </aside>
    </div>
  );
}
