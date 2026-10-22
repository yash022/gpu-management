import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import './Notifications.css';

function formatNotificationTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function getTypeBadge(type) {
  switch (type?.toLowerCase()) {
    case 'success':
    case 'booking_confirmed':
      return 'type-success';
    case 'warning':
    case 'booking_cancelled':
      return 'type-warning';
    case 'error':
      return 'type-error';
    case 'queue_update':
      return 'type-info';
    default:
      return 'type-info';
  }
}

function formatTypeLabel(type) {
  switch (type) {
    case 'booking_confirmed':
      return 'Confirmed';
    case 'booking_cancelled':
      return 'Cancelled';
    case 'queue_update':
      return 'Waitlist';
    default:
      return type || 'Info';
  }
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch {
      setError('Unable to update notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      window.dispatchEvent(new Event('notifications-updated'));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      setError('Unable to update notifications. Please try again.');
    }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      window.dispatchEvent(new Event('notifications-updated'));
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      setError('Unable to update notifications. Please try again.');
    }
  };

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <Layout>
      <div className="notifications-page">
        <div className="notifications-header">
          <h1>Notifications</h1>
          {hasUnread && (
            <button className="btn-mark-all" onClick={markAllRead}>
              Mark All Read
            </button>
          )}
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {loading ? (
          <p className="loading-text">Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <p className="empty-text">No notifications found.</p>
        ) : (
          <div className="notifications-list">
            {notifications.map((n) => (
              <div
                key={n.id}
                role="button" tabIndex={0}
                aria-label={`${n.is_read ? 'Read' : 'Mark as read'}: ${n.message}`}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!n.is_read) markAsRead(n.id); } }}
                className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                onClick={() => !n.is_read && markAsRead(n.id)}
              >
                <div className="notification-content">
                  <div className="notification-top">
                    <span className={`type-badge ${getTypeBadge(n.type)}`}>
                      {formatTypeLabel(n.type)}
                    </span>
                    <span className="notification-time">
                      {formatNotificationTime(n.created_at)}
                    </span>
                  </div>
                  <p className="notification-message">{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
