import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalGames: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/admin/stats')
      .then((res) => setStats(res.data as Stats))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner">Dang tai...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Quan tri he thong</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.totalUsers ?? 0}</div>
          <div className="stat-label">Tong so nguoi dung</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.activeUsers ?? 0}</div>
          <div className="stat-label">Hoat dong (7 ngay)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalGames ?? 0}</div>
          <div className="stat-label">Tong so game</div>
        </div>
      </div>

      <div className="admin-links">
        <Link to="/admin/users" className="admin-link-card">
          <h3>Quan ly nguoi dung</h3>
          <p>Tao tai khoan, khoa/mo khoa nguoi dung</p>
        </Link>
        <Link to="/admin/games" className="admin-link-card">
          <h3>Quan ly game</h3>
          <p>Upload ROM, chinh sua thong tin game</p>
        </Link>
      </div>
    </div>
  );
}
