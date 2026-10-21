import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import './Layout.css';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      const unread = res.data.filter((n) => !n.is_read).length;
      setUnreadCount(unread);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/dashboard" className="navbar-brand">
            <span style={{ marginRight: '6px' }}>⚡</span> GPU Manager
          </Link>
          <div className="navbar-links">
            <Link
              to="/dashboard"
              className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
            >
              Dashboard
            </Link>
            <Link
              to="/reservations"
              className={`nav-link ${isActive('/reservations') ? 'active' : ''}`}
            >
              My Reservations
            </Link>
            <Link
              to="/notifications"
              className={`nav-link nav-link-bell ${isActive('/notifications') ? 'active' : ''}`}
            >
              🔔
              {unreadCount > 0 && (
                <span className="badge-count">{unreadCount}</span>
              )}
            </Link>
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className={`nav-link ${isActive('/admin') ? 'active' : ''}`}
              >
                Admin Panel
              </Link>
            )}
          </div>
          <div className="navbar-user">
            <span className="user-name">
              {user?.name} <span style={{ opacity: 0.7, fontSize: '0.85em' }}>({user?.role})</span>
            </span>
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
