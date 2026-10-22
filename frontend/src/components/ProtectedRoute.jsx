import { Fragment } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, sessionError, refreshSession } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="loading-page" role="status">
        Checking your session...
      </div>
    );
  if (sessionError)
    return (
      <div className="session-recovery">
        <h1>Let us reconnect.</h1>
        <p role="alert">{sessionError}</p>
        <button className="btn-primary" onClick={() => refreshSession(true)}>
          Retry connection
        </button>
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  if (adminOnly && user.role !== "admin")
    return <Navigate to="/dashboard" replace />;
  return <Fragment key={user.id}>{children}</Fragment>;
}
