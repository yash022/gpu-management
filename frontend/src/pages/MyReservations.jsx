import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import './MyReservations.css';

export default function MyReservations() {
  const [reservations, setReservations] = useState([]);
  const [queueItems, setQueueItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const [successMsg, setSuccessMsg] = useState(
    location.state?.success ? 'Reservation created successfully!' : ''
  );

  const fetchReservationsAndQueue = useCallback(async () => {
    try {
      const [resRes, queueRes] = await Promise.all([
        api.get('/reservations'),
        api.get('/queue').catch(() => ({ data: [] })),
      ]);
      setReservations(resRes.data);
      setQueueItems(queueRes.data);
    } catch {
      setError('Unable to load reservations. Please refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservationsAndQueue();
  }, [fetchReservationsAndQueue]);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this reservation?')) return;
    try {
      await api.put(`/reservations/${id}/cancel`);
      fetchReservationsAndQueue();
    } catch {
      alert('Failed to cancel reservation.');
    }
  };

  const handleLeaveQueue = async (id) => {
    if (!window.confirm('Leave the waitlist queue?')) return;
    try {
      await api.delete(`/queue/${id}`);
      fetchReservationsAndQueue();
    } catch {
      alert('Failed to leave queue.');
    }
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'status-confirmed';
      case 'cancelled':
        return 'status-cancelled';
      case 'completed':
        return 'status-completed';
      case 'waiting':
        return 'status-maintenance';
      case 'notified':
        return 'status-available';
      default:
        return '';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <Layout>
      <div className="my-reservations">
        <h1>My reservations & queue</h1>
        {error && <div className="form-error" role="alert">{error}</div>}
        {successMsg && <div className="success-msg">{successMsg}</div>}
        {loading ? (
          <p className="loading-text">Loading reservations...</p>
        ) : (
          <>
            {/* Active Queue Section */}
            {queueItems.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⏳</span> Active Waitlist Queue
                </h2>
                <div className="reservations-table-wrapper">
                  <table className="reservations-table">
                    <thead>
                      <tr>
                        <th>GPU Model</th>
                        <th>Location</th>
                        <th>Queue Position</th>
                        <th>Status</th>
                        <th>Joined</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueItems.map((q) => (
                        <tr key={q.id}>
                          <td className="td-model">{q.gpu_model} ({q.gpu_vram})</td>
                          <td>{q.gpu_location}</td>
                          <td><strong style={{ color: '#2563eb' }}>#{q.position} in line</strong></td>
                          <td>
                            <span className={`status-badge ${getStatusClass(q.status)}`}>
                              {q.status === 'notified' ? 'Slot Available! Book Now' : q.status}
                            </span>
                          </td>
                          <td>{formatDate(q.joined_at)}</td>
                          <td>
                            {q.status === 'notified' ? (
                              <Link to={`/book/${q.gpu_id}`} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.85rem' }}>
                                Book Now
                              </Link>
                            ) : (
                              <button
                                className="btn-cancel"
                                onClick={() => handleLeaveQueue(q.id)}
                              >
                                Leave
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Reservations List */}
            <h2 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>Booking History</h2>
            {reservations.length === 0 ? (
              <div className="empty-state">
                <p>No reservations yet.</p>
                <Link to="/dashboard" className="btn-primary">
                  Browse GPUs
                </Link>
              </div>
            ) : (
              <div className="reservations-table-wrapper">
                <table className="reservations-table">
                  <thead>
                    <tr>
                      <th>GPU Model</th>
                      <th>Date</th>
                      <th>Time Slot</th>
                      <th>Purpose</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((r) => (
                      <tr key={r.id}>
                        <td className="td-model">{r.gpu_model || `GPU #${r.gpu_id}`}</td>
                        <td>{formatDate(r.date)}</td>
                        <td>
                          {r.start_time} – {r.end_time}
                        </td>
                        <td className="td-purpose">{r.purpose}</td>
                        <td>
                          <span className={`status-badge ${getStatusClass(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>
                          {r.status?.toLowerCase() === 'confirmed' && (
                            <button
                              className="btn-cancel"
                              onClick={() => handleCancel(r.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
