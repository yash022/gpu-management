import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import './Dashboard.css';

export default function Dashboard() {
  const [gpus, setGpus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchGpus = useCallback(async () => {
    try {
      const res = await api.get('/gpus');
      setGpus(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGpus();
  }, [fetchGpus]);

  const filteredGpus = gpus.filter((gpu) =>
    gpu.model.toLowerCase().includes(search.toLowerCase()) ||
    gpu.location?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'available':
        return 'status-available';
      case 'maintenance':
        return 'status-maintenance';
      case 'retired':
        return 'status-retired';
      default:
        return '';
    }
  };

  return (
    <Layout>
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>GPU Resource Availability</h1>
            <p style={{ color: 'var(--text-secondary, #6b7280)', marginTop: '4px' }}>
              Real-time computing hardware catalog — Manipal University Jaipur
            </p>
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search by model or lab location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <p className="loading-text">Loading GPUs...</p>
        ) : filteredGpus.length === 0 ? (
          <p className="empty-text">No GPUs found matching your search.</p>
        ) : (
          <div className="gpu-grid">
            {filteredGpus.map((gpu) => (
              <div key={gpu.id} className="gpu-card">
                <div className="gpu-card-header">
                  <h3 className="gpu-model">{gpu.model}</h3>
                  <span className={`status-badge ${getStatusClass(gpu.status)}`}>
                    {gpu.status}
                  </span>
                </div>
                <div className="gpu-details">
                  <div className="gpu-detail">
                    <span className="detail-label">VRAM</span>
                    <span className="detail-value">{gpu.vram}</span>
                  </div>
                  <div className="gpu-detail">
                    <span className="detail-label">Location</span>
                    <span className="detail-value">{gpu.location}</span>
                  </div>
                  <div className="gpu-detail">
                    <span className="detail-label">Hardware ID</span>
                    <span className="detail-value">GPU #{gpu.id}</span>
                  </div>
                </div>
                <button
                  className="btn-reserve"
                  disabled={gpu.status?.toLowerCase() === 'retired'}
                  onClick={() => navigate(`/book/${gpu.id}`)}
                >
                  {gpu.status?.toLowerCase() === 'available'
                    ? 'Book Time Slot'
                    : gpu.status?.toLowerCase() === 'maintenance'
                    ? 'View / Reserve Slot'
                    : 'Retired'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
