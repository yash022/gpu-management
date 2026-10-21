import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import './AdminPanel.css';

export default function AdminPanel() {
  const [stats, setStats] = useState(null);
  const [gpus, setGpus] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState('gpus'); // 'gpus', 'reservations', 'users', 'reports'

  // Add GPU form state
  const [newGpu, setNewGpu] = useState({ model: '', vram: '', status: 'available', location: '' });
  // Edit GPU form state
  const [editGpu, setEditGpu] = useState({ model: '', vram: '', status: '', location: '' });

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, gpusRes, reservationsRes, usersRes, reportsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/gpus'),
        api.get('/reservations/all'),
        api.get('/admin/users').catch(() => ({ data: [] })),
        api.get('/admin/reports').catch(() => ({ data: null })),
      ]);
      setStats(statsRes.data);
      setGpus(gpusRes.data);
      setReservations(reservationsRes.data);
      setUsers(usersRes.data);
      setReports(reportsRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleAddGpu = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!newGpu.model || !newGpu.vram || !newGpu.location) {
      setFormError('Please fill in all fields.');
      return;
    }
    try {
      await api.post('/gpus', newGpu);
      setNewGpu({ model: '', vram: '', status: 'available', location: '' });
      setShowAddForm(false);
      fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to add GPU.');
    }
  };

  const startEdit = (gpu) => {
    setEditingId(gpu.id);
    setEditGpu({ model: gpu.model, vram: gpu.vram, status: gpu.status, location: gpu.location });
    setFormError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormError('');
  };

  const handleEditGpu = async (id) => {
    setFormError('');
    if (!editGpu.model || !editGpu.vram || !editGpu.location) {
      setFormError('Please fill in all fields.');
      return;
    }
    try {
      await api.put(`/gpus/${id}`, editGpu);
      setEditingId(null);
      fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update GPU.');
    }
  };

  const handleDeleteGpu = async (id) => {
    if (!window.confirm('Are you sure you want to delete this GPU?')) return;
    try {
      await api.delete(`/gpus/${id}`);
      fetchAll();
    } catch {
      alert('Failed to delete GPU.');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update role.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user account?')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user.');
    }
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'available':
        return 'status-available';
      case 'maintenance':
        return 'status-maintenance';
      case 'retired':
        return 'status-retired';
      case 'confirmed':
        return 'status-confirmed';
      case 'cancelled':
        return 'status-cancelled';
      case 'completed':
        return 'status-completed';
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

  if (loading) {
    return (
      <Layout>
        <p className="loading-text">Loading admin dashboard...</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="admin-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1>Admin Control Panel</h1>
            <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
              GPU Resource Reservation & Management System — MUJ
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{stats.total_users}</span>
              <span className="stat-label">Registered Users</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.total_gpus}</span>
              <span className="stat-label">Total GPUs</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.active_reservations}</span>
              <span className="stat-label">Active Bookings</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.gpus_available}</span>
              <span className="stat-label">Available GPUs</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.gpus_maintenance}</span>
              <span className="stat-label">In Maintenance</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.waiting_in_queue || 0}</span>
              <span className="stat-label">Waiting in Queue</span>
            </div>
          </div>
        )}

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab('gpus')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: activeTab === 'gpus' ? '3px solid #2563eb' : '3px solid transparent',
              color: activeTab === 'gpus' ? '#2563eb' : '#4b5563',
            }}
          >
            GPU Hardware ({gpus.length})
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: activeTab === 'reservations' ? '3px solid #2563eb' : '3px solid transparent',
              color: activeTab === 'reservations' ? '#2563eb' : '#4b5563',
            }}
          >
            All Reservations ({reservations.length})
          </button>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: activeTab === 'users' ? '3px solid #2563eb' : '3px solid transparent',
              color: activeTab === 'users' ? '#2563eb' : '#4b5563',
            }}
          >
            User Accounts ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: activeTab === 'reports' ? '3px solid #2563eb' : '3px solid transparent',
              color: activeTab === 'reports' ? '#2563eb' : '#4b5563',
            }}
          >
            Usage Analytics
          </button>
        </div>

        {/* Tab 1: GPU Management */}
        {activeTab === 'gpus' && (
          <section className="admin-section">
            <div className="section-header">
              <h2>GPU Hardware Inventory</h2>
              <button
                className="btn-primary"
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  setFormError('');
                }}
              >
                {showAddForm ? 'Cancel' : '+ Add GPU'}
              </button>
            </div>

            {showAddForm && (
              <div className="inline-form">
                {formError && <div className="form-error">{formError}</div>}
                <form onSubmit={handleAddGpu}>
                  <div className="form-inline-row">
                    <div className="form-group">
                      <label>Model</label>
                      <input
                        type="text"
                        value={newGpu.model}
                        onChange={(e) => setNewGpu({ ...newGpu, model: e.target.value })}
                        placeholder="e.g. NVIDIA A100"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>VRAM</label>
                      <input
                        type="text"
                        value={newGpu.vram}
                        onChange={(e) => setNewGpu({ ...newGpu, vram: e.target.value })}
                        placeholder="e.g. 80 GB"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={newGpu.status}
                        onChange={(e) => setNewGpu({ ...newGpu, status: e.target.value })}
                      >
                        <option value="available">Available</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="retired">Retired</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Location</label>
                      <input
                        type="text"
                        value={newGpu.location}
                        onChange={(e) => setNewGpu({ ...newGpu, location: e.target.value })}
                        placeholder="e.g. Server Room A - Rack 4"
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn-primary">
                    Save GPU
                  </button>
                </form>
              </div>
            )}

            <div className="table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Model</th>
                    <th>VRAM</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gpus.map((gpu) =>
                    editingId === gpu.id ? (
                      <tr key={gpu.id} className="editing-row">
                        <td>{gpu.id}</td>
                        <td>
                          <input
                            type="text"
                            value={editGpu.model}
                            onChange={(e) =>
                              setEditGpu({ ...editGpu, model: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editGpu.vram}
                            onChange={(e) =>
                              setEditGpu({ ...editGpu, vram: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={editGpu.status}
                            onChange={(e) =>
                              setEditGpu({ ...editGpu, status: e.target.value })
                            }
                          >
                            <option value="available">Available</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="retired">Retired</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editGpu.location}
                            onChange={(e) =>
                              setEditGpu({ ...editGpu, location: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-save"
                              onClick={() => handleEditGpu(gpu.id)}
                            >
                              Save
                            </button>
                            <button className="btn-cancel-edit" onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={gpu.id}>
                        <td>{gpu.id}</td>
                        <td className="td-model">{gpu.model}</td>
                        <td>{gpu.vram}</td>
                        <td>
                          <span className={`status-badge ${getStatusClass(gpu.status)}`}>
                            {gpu.status}
                          </span>
                        </td>
                        <td>{gpu.location}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-edit"
                              onClick={() => startEdit(gpu)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-delete"
                              onClick={() => handleDeleteGpu(gpu.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            {formError && editingId && <div className="form-error" style={{ marginTop: 12 }}>{formError}</div>}
          </section>
        )}

        {/* Tab 2: Reservations */}
        {activeTab === 'reservations' && (
          <section className="admin-section">
            <h2>All Reservations</h2>
            <div className="table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>GPU</th>
                    <th>Date</th>
                    <th>Time Slot</th>
                    <th>Purpose</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty-cell">
                        No reservations found.
                      </td>
                    </tr>
                  ) : (
                    reservations.map((r) => (
                      <tr key={r.id}>
                        <td className="td-model">{r.user_name || 'N/A'}</td>
                        <td>{r.user_email || 'N/A'}</td>
                        <td>{r.gpu_model || `GPU #${r.gpu_id}`}</td>
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Tab 3: User Accounts */}
        {activeTab === 'users' && (
          <section className="admin-section">
            <h2>User Account Management</h2>
            <div className="table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td className="td-model">{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        >
                          <option value="student">Student</option>
                          <option value="faculty">Faculty</option>
                          <option value="researcher">Researcher</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn-delete"
                          onClick={() => handleDeleteUser(u.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Tab 4: Usage Reports */}
        {activeTab === 'reports' && (
          <section className="admin-section">
            <h2>Usage & Utilization Analytics</h2>
            {reports ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
                <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Reservations by GPU Model</h3>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>GPU Model</th>
                        <th>Bookings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.gpu_utilization?.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.model}</td>
                          <td><strong>{item.reservation_count}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Bookings by User Role</h3>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User Role</th>
                        <th>Bookings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.role_distribution?.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ textTransform: 'capitalize' }}>{item.role}</td>
                          <td><strong>{item.count}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p>No analytics data available yet.</p>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
