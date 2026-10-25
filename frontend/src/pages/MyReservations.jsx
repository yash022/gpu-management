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
  const [now, setNow] = useState(() => Date.now());
  const location = useLocation();
  const [successMsg, setSuccessMsg] = useState(
    location.state?.success ? 'Reservation created successfully!' : ''
  );

  const fetchReservationsAndQueue = useCallback(async () => {
    try {
      const [resRes, queueRes] = await Promise.all([
        api.get('/reservations'),
        api.get('/queue'),
      ]);
      setReservations(resRes.data);
      setQueueItems(queueRes.data);
      setError('');
    } catch {
      setError('Unable to load reservations. Please refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservationsAndQueue();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') fetchReservationsAndQueue();
    }, 15000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const focus = () => fetchReservationsAndQueue();
    window.addEventListener('focus', focus);
    return () => { clearInterval(poll); clearInterval(clock); window.removeEventListener('focus', focus); };
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
    if (!window.confirm('Leave the waitlist? Any held slot will be offered to the next user.')) return;
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
        <p>Cancelled future slots are offered in queue order, with an exclusive hold of up to 5 minutes. Book the offered slot or decline to pass it on. Queue updates every 15 seconds.</p>
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
                        <th>Offered slot (IST)</th>
                        <th>Joined</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueItems.map((q) => (
                        <tr key={q.id}>
                          <td className="td-model">{q.gpu_model} ({q.gpu_vram})</td>
                          <td>{q.gpu_location}</td>
                          <td>{q.status === 'waiting' ? <strong style={{ color: '#2563eb' }}>#{q.position} in line</strong> : '—'}</td>
                          <td>
                            <span className={`status-badge ${getStatusClass(q.status)}`}>
                              {q.reservation_id ? 'Booked' : q.status === 'notified' ? (new Date(q.offer_expires_at).getTime() > now ? 'Held for you' : 'Offer expired') : q.status}
                            </span>
                          </td>
                          <td>{q.offer_date ? <>
                            {q.offer_date.slice(0, 10)} {q.offer_start?.slice(0, 5)}–{q.offer_end?.slice(0, 5)}
                            {q.status === 'notified' && <div>{Math.max(0, Math.ceil((new Date(q.offer_expires_at).getTime() - now) / 1000))} seconds remaining</div>}
                          </> : 'Awaiting a cancelled slot'}</td>
                          <td>{formatDate(q.joined_at)}</td>
                          <td>
                            {q.status === 'notified' && new Date(q.offer_expires_at).getTime() > now && (
                              <Link to={`/book/${q.gpu_id}?offer=${q.id}`} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.85rem' }}>
                                Book Now
                              </Link>
                            )}
                            {['waiting', 'notified'].includes(q.status) && (
                              <button
                                className="btn-cancel"
                                onClick={() => handleLeaveQueue(q.id)}
                              >
                                {q.status === 'notified' ? 'Decline offer' : 'Leave'}
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
