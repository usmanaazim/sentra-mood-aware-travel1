/**
 * Application state: session auth, toasts, and the visitor's local review list.
 * Session data lives only in the HTTP-only cookie set by the API - nothing
 * sensitive is kept in localStorage.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { loadReviewed, recordReviewed } from '../lib/favorites.js';

/* ------------------------------- toasts ---------------------------------- */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((message, tone = 'info', ttl = 5200) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((list) => [...list.slice(-3), { id, message, tone }]);
    timers.current.set(id, setTimeout(() => dismiss(id), ttl));
    return id;
  }, [dismiss]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);

  const value = useMemo(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error', 7000),
    info: (m) => push(m, 'info'),
    toasts,
    dismiss
  }), [push, dismiss, toasts]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext) || { success() {}, error() {}, info() {}, toasts: [] };

/* -------------------------------- auth ----------------------------------- */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionNotice, setSessionNotice] = useState(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data?.user || null);
      return data?.user || null;
    } catch {
      // Backend unreachable: the app still works in demo mode.
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (credentials) => {
    const data = await api.login(credentials);
    setUser(data.user);
    setSessionNotice(null);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.register(payload);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setSessionNotice(null);
      toast.info('You have been signed out.');
    }
  }, [toast]);

  /** Call from any API error handler so an expired session redirects cleanly. */
  const handleAuthError = useCallback((err) => {
    if (err instanceof ApiError && err.isAuth) {
      setUser(null);
      setSessionNotice('Your session expired. Please sign in again.');
      return true;
    }
    return false;
  }, []);

  const value = useMemo(() => ({
    user, ready, sessionNotice, setSessionNotice, login, register, logout, refresh, handleAuthError
  }), [user, ready, sessionNotice, login, register, logout, refresh, handleAuthError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/* ------------------------------- reviews --------------------------------- */
const ReviewContext = createContext(null);

/**
 * Reviews work in two layers:
 *  - signed-in users: persisted server-side (SQLite) and used for personalisation
 *  - everyone else (e.g. demo mode): kept on this device only
 */
export function ReviewProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [reviews, setReviews] = useState(() => loadReviewed());
  const [serverReviews, setServerReviews] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadServer = useCallback(async () => {
    if (!user) { setServerReviews([]); return; }
    setLoading(true);
    try {
      const data = await api.feedback();
      setServerReviews(data.feedback || []);
    } catch {
      /* non-fatal: the page still works with local state */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadServer(); }, [loadServer]);

  const savedByKey = useMemo(() => {
    const map = {};
    for (const r of serverReviews) map[r.osmKey] = r;
    return map;
  }, [serverReviews]);

  const getReview = useCallback((osmKey) => savedByKey[osmKey] || reviews[osmKey] || null, [savedByKey, reviews]);

  const saveReview = useCallback(async (place, entry) => {
    setReviews((prev) => recordReviewed(place.osmKey, { ...prev[place.osmKey], ...entry }));
    if (!user) return { stored: 'device' };
    try {
      const data = await api.saveFeedback({
        osmKey: place.osmKey,
        name: place.name || null,
        category: place.category || null,
        vote: entry.vote ?? null,
        rating: entry.rating ?? null,
        comment: entry.comment ?? null
      });
      toast.success(data?.message || 'Feedback saved to your account.');
      await loadServer();
      return { stored: 'server', feedback: data?.feedback };
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save feedback.');
      return { stored: 'device', error: err };
    }
  }, [user, toast, loadServer]);

  const removeReview = useCallback(async (reviewId) => {
    if (!reviewId) return;
    try {
      await api.deleteFeedback(reviewId);
      toast.info('Feedback entry removed.');
      await loadServer();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove that entry.');
    }
  }, [toast, loadServer]);

  const value = useMemo(() => ({
    reviews, serverReviews, savedByKey, loading, getReview, saveReview, removeReview, reload: loadServer
  }), [reviews, serverReviews, savedByKey, loading, getReview, saveReview, removeReview, loadServer]);

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

export const useReviews = () => useContext(ReviewContext);

/* ---------------------------- composition -------------------------------- */
export function AppProviders({ children }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <ReviewProvider>{children}</ReviewProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
