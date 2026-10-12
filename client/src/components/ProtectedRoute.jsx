/** Guards account-specific routes and returns the user to where they were headed. */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../state/store.jsx';
import { LoadingState } from './States.jsx';

export default function ProtectedRoute({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="container page">
        <LoadingState title="Checking your session…" message="Verifying your SENTRA session with the server." />
      </div>
    );
  }
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace state={{ from: next }} />;
  }
  return children;
}
