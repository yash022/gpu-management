import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useState, useEffect } from "react";
import api from "../api/axios";
import { authError } from "../api/axios";
import "./Layout.css";
export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const handleLogout = async (all = false) => {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError("");
    try {
      await logout(all);
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(authError(error, "Sign-out failed. Please try again."));
    } finally {
      setSigningOut(false);
    }
  };
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      return api
        .get("/notifications")
        .then(({ data }) => {
          if (active && current === revision) setUnread(data.filter((n) => !n.is_read).length);
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("notifications-updated", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("notifications-updated", refresh);
    };
  }, []);
  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/dashboard" className="brand">
          <span className="brand-mark">G</span>
          <span>
            GPU<span className="brand-light">space</span>
            <small>MANIPAL UNIVERSITY JAIPUR</small>
          </span>
        </Link>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          <NavLink to="/dashboard">
            <span aria-hidden="true">▦</span> GPU catalog
          </NavLink>
          <NavLink to="/reservations">
            <span aria-hidden="true">▤</span> My reservations
          </NavLink>
          <NavLink to="/notifications">
            <span aria-hidden="true">◉</span> Notifications{" "}
            {unread > 0 && <b className="unread-count">{unread}</b>}
          </NavLink>
          {user?.role === "admin" && (
            <NavLink to="/admin">
              <span aria-hidden="true">⚙</span> Administration
            </NavLink>
          )}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">BUILT FOR YOUR NEXT IDEA</span>
          <p>
            More compute.
            <br />
            More possibilities.
          </p>
          <small>Your campus research workspace.</small>
        </div>
        <div className="profile">
          <span className="avatar">
            {user?.name?.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{user?.name}</strong>
            <small>{user?.role}</small>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            disabled={signingOut}
            onClick={() => handleLogout()}
          >
            Sign out
          </button>
        </div>
        <button
          className="account-settings-toggle"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((v) => !v)}
        >
          Session options
        </button>
        {accountOpen && (
          <div className="account-session-options">
            <span>Signed in as {user?.email}</span>
            <button disabled={signingOut} onClick={() => handleLogout(true)}>
              Sign out on all devices
            </button>
          </div>
        )}
        {signingOut && (
          <p className="session-status" role="status">
            Signing out securely...
          </p>
        )}
        {logoutError && (
          <div className="logout-error" role="alert">
            {logoutError}
            <button onClick={() => handleLogout()}>Retry sign out</button>
          </div>
        )}
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <span>
            Research computing <span className="topbar-divider">/</span>{" "}
            <strong>MUJ workspace</strong>
          </span>
          <Link to="/reservations">My bookings ↗</Link>
        </header>
        <main id="main-content" className="content" tabIndex="-1">
          {children}
        </main>
        <footer className="workspace-footer">
          GPUspace · Manipal University Jaipur
          <span>Made for research. Built for discovery.</span>
        </footer>
      </div>
    </div>
  );
}
