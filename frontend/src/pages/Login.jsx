import AuthStory from "../components/AuthStory";
import { useState, useRef } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { authError } from "../api/axios";
import "./Login.css";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const { login, user, loading, notice, sessionError, refreshSession } =
    useAuth();
  const location = useLocation();
  const from = location.state?.from;
  const destination =
    typeof from === "string" &&
    /^\/(dashboard|book\/\d+|reservations|notifications|admin)(\?|$)/.test(from)
      ? from
      : "/dashboard";
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setError("");
    try {
      await login(email, password, remember);
      setPassword("");
    } catch (err) {
      setError(authError(err, "Sign-in failed. Please try again."));
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };
  if (loading)
    return (
      <div className="loading-page" role="status">
        Checking your session...
      </div>
    );
  if (user && !sessionError) return <Navigate to={destination} replace />;
  return (
    <div className="login-page">
      <AuthStory />
      <div className="login-card">
        <div className="login-header">
          <span className="eyebrow">YOUR RESEARCH WORKSPACE</span>
          <h1>Welcome back.</h1>
          <p className="login-subtitle">
            Sign in to reserve your next GPU session.
          </p>
        </div>
        {notice && !error && (
          <div className="auth-notice" role="status">
            {notice}
          </div>
        )}
        {error && (
          <div id="login-error" className="form-error" role="alert">
            {error}
          </div>
        )}
        {sessionError && (
          <div className="auth-notice" role="alert">
            {sessionError}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => refreshSession(true)}
            >
              Retry connection
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} aria-busy={submitting}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
              maxLength={150}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              placeholder="you@muj.manipal.edu"
              readOnly={submitting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={72}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                onBlur={() => setCapsLock(false)}
                placeholder="Enter your password"
                readOnly={submitting}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {capsLock && (
              <small className="password-hint" role="status">
                Caps Lock is on.
              </small>
            )}
          </div>
          <label className="remember-choice">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={submitting}
            />
            <span>
              Keep me signed in on this device
              <small>Up to 30 days. Use only on a private device.</small>
            </span>
          </label>
          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="login-footer">
          New to GPUspace? <Link to="/register">Create an account</Link>
        </p>
        <p className="auth-help">
          Need account access? Contact your campus GPU administrator.
        </p>
      </div>
    </div>
  );
}
