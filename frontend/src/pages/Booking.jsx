import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import './Booking.css';

const todayInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function Booking() {
  const { gpuId } = useParams();
  const navigate = useNavigate();
  const [gpu, setGpu] = useState(null);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [conflictOccurred, setConflictOccurred] = useState(false);
  const [queueSuccess, setQueueSuccess] = useState('');

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [purpose, setPurpose] = useState('');

  const fetchGpuData = useCallback(async () => {
    try {
      const [gpusRes, queueRes] = await Promise.all([
        api.get('/gpus'),
        api.get(`/queue/gpu/${gpuId}`).catch(() => ({ data: { waiting_count: 0 } })),
      ]);
      const found = gpusRes.data.find((g) => g.id === parseInt(gpuId));
      setGpu(found || null);
      setQueueCount(queueRes.data?.waiting_count || 0);
    } catch {
      setError('Unable to load this resource. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [gpuId]);

  useEffect(() => {
    fetchGpuData();
  }, [fetchGpuData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setConflictOccurred(false);
    setQueueSuccess('');

    if (!date || !startTime || !endTime || !purpose.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (startTime >= endTime) {
      setError('End time must be after start time.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/reservations', {
        gpu_id: parseInt(gpuId),
        date,
        start_time: startTime,
        end_time: endTime,
        purpose: purpose.trim(),
      });
      navigate('/reservations', { state: { success: true } });
    } catch (err) {
      if (err.response?.status === 409) {
        setError('This time slot is already reserved by another user.');
        setConflictOccurred(true);
      } else {
        const msg =
          err.response?.data?.error || err.response?.data?.message || 'Booking failed.';
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinQueue = async () => {
    try {
      const res = await api.post('/queue', { gpu_id: parseInt(gpuId) });
      setQueueSuccess(`Successfully joined waitlist at position #${res.data.position}! You will be notified if a slot opens up.`);
      setConflictOccurred(false);
      setQueueCount((prev) => prev + 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join waitlist.');
    }
  };

  if (loading) {
    return (
      <Layout>
        <p className="loading-text">Loading...</p>
      </Layout>
    );
  }

  if (!gpu) {
    return (
      <Layout>
        <p className="empty-text">{error || 'GPU not found.'}</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="booking">
        <h1>Make room for your next idea.</h1>
        <p className="booking-hint">Choose your session. All dates and times are in India Standard Time (IST).</p>
        <div className="booking-gpu-info">
          <div>
            <h2>{gpu.model}</h2>
            <div className="booking-gpu-meta">
              <span>VRAM: {gpu.vram}</span>
              <span>Location: {gpu.location}</span>
              <span>Status: <strong>{gpu.status}</strong></span>
              {queueCount > 0 && <span>Waitlist: <strong>{queueCount} user(s)</strong></span>}
            </div>
          </div>
        </div>

        {queueSuccess && (
          <div style={{ background: '#d1fae5', color: '#065f46', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #6ee7b7' }}>
            {queueSuccess}
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        {conflictOccurred && (
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '14px', borderRadius: '8px', marginBottom: '16px' }}>
            <p style={{ margin: '0 0 10px 0', color: '#92400e', fontWeight: 500 }}>
              Slot conflict: Another researcher or student is using {gpu.model} during this slot.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ background: '#d97706', borderColor: '#d97706' }}
              onClick={handleJoinQueue}
            >
              Join Waitlist Queue for this GPU
            </button>
          </div>
        )}

        {gpu.status !== 'available' && <div className="form-error" role="alert">This resource is currently unavailable for reservations.</div>}
        <form className="booking-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="date">Reservation Date</label>
            <input
              id="date"
              type="date"
              min={todayInIndia()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="start-time">Start Time</label>
              <input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="end-time">End Time</label>
              <input
                id="end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="purpose">Research / Project Purpose</label>
            <textarea
              id="purpose"
              rows="3"
              maxLength={2000}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g., Fine-tuning Llama-3 for NLP Lab experiment, Deep learning computer vision model"
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="submit" className="btn-primary" disabled={submitting || gpu.status !== 'available'}>
              {submitting ? 'Confirming...' : 'Confirm Reservation'}
            </button>
            <button
              type="button"
              className="btn-cancel-edit"
              style={{ background: '#e5e7eb', color: '#374151', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              onClick={() => navigate('/dashboard')}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
