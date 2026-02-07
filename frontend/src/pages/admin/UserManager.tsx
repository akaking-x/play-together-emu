import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface User {
  _id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

interface CreatedUser {
  username: string;
  password: string;
  displayName: string;
}

export function UserManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Single user creation
  const [displayName, setDisplayName] = useState('');
  const [customUsername, setCustomUsername] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [creatingOne, setCreatingOne] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Batch creation
  const [batchCount, setBatchCount] = useState(10);
  const [batchPrefix, setBatchPrefix] = useState('Player');
  const [creatingBatch, setCreatingBatch] = useState(false);

  // Created credentials display
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);

  const fetchUsers = async (p: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users?page=${p}&limit=50`);
      const data = res.data as { users: User[]; total: number };
      setUsers(data.users);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(page);
  }, [page]);

  const handleCreateOne = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingOne(true);
    setCreateError(null);
    try {
      const body: Record<string, string> = { displayName: displayName || 'Player' };
      if (customUsername.trim()) body.username = customUsername.trim();
      if (customPassword) body.password = customPassword;
      const res = await api.post('/admin/users', body);
      setCreatedUsers([res.data as CreatedUser]);
      setDisplayName('');
      setCustomUsername('');
      setCustomPassword('');
      fetchUsers(page);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setCreateError(axiosErr.response?.data?.error ?? 'Loi khi tao tai khoan');
    } finally {
      setCreatingOne(false);
    }
  };

  const handleCreateBatch = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingBatch(true);
    try {
      const res = await api.post('/admin/users/batch', { count: batchCount, prefix: batchPrefix });
      setCreatedUsers((res.data as { users: CreatedUser[] }).users);
      fetchUsers(page);
    } finally {
      setCreatingBatch(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    await api.patch(`/admin/users/${user._id}`, { isActive: !user.isActive });
    fetchUsers(page);
  };

  const handleResetPassword = async (user: User) => {
    const choice = prompt(
      `Reset mat khau cho "${user.displayName}" (${user.username}):\n\n` +
      '- Nhap mat khau moi, hoac\n' +
      '- Bo trong de tao mat khau ngau nhien\n\n' +
      'Mat khau moi:'
    );
    // null = user cancelled the prompt
    if (choice === null) return;

    const body: Record<string, unknown> = { resetPassword: true };
    if (choice.trim()) {
      body.newPassword = choice.trim();
    }
    const res = await api.patch(`/admin/users/${user._id}`, body);
    const data = res.data as { newPassword?: string };
    if (data.newPassword) {
      setCreatedUsers([{ username: user.username, password: data.newPassword, displayName: user.displayName }]);
    }
  };

  const handleDelete = async (user: User) => {
    if (!window.confirm(`Xoa nguoi dung ${user.username}?`)) return;
    await api.delete(`/admin/users/${user._id}`);
    fetchUsers(page);
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="page-header">
        <h1>Quan ly nguoi dung</h1>
        <p className="text-muted">Tong: {total} nguoi dung</p>
      </div>

      {/* Create single user */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Tao tai khoan moi</h3>
        <form onSubmit={handleCreateOne} className="inline-form">
          <input
            type="text"
            placeholder="Ten hien thi (tuy chon)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Username (bo trong = ngau nhien)"
            value={customUsername}
            onChange={(e) => setCustomUsername(e.target.value)}
            autoComplete="off"
          />
          <input
            type="text"
            placeholder="Password (bo trong = ngau nhien)"
            value={customPassword}
            onChange={(e) => setCustomPassword(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={creatingOne}>
            {creatingOne ? 'Dang tao...' : 'Tao 1 tai khoan'}
          </button>
        </form>
        {createError && (
          <p style={{ color: '#ff4444', marginTop: 8, marginBottom: 0, fontSize: 13 }}>{createError}</p>
        )}
      </div>

      {/* Create batch users */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Tao hang loat</h3>
        <form onSubmit={handleCreateBatch} className="inline-form">
          <input
            type="number"
            min={1}
            max={100}
            value={batchCount}
            onChange={(e) => setBatchCount(parseInt(e.target.value) || 10)}
            style={{ width: 80 }}
          />
          <input
            type="text"
            placeholder="Prefix ten"
            value={batchPrefix}
            onChange={(e) => setBatchPrefix(e.target.value)}
            style={{ width: 150 }}
          />
          <button type="submit" className="btn btn-primary" disabled={creatingBatch}>
            {creatingBatch ? 'Dang tao...' : `Tao ${batchCount} tai khoan`}
          </button>
        </form>
      </div>

      {/* Show created credentials */}
      {createdUsers.length > 0 && (
        <div className="card credentials-card" style={{ marginBottom: 20 }}>
          <h3>Tai khoan vua tao (luu lai ngay!)</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ten hien thi</th>
                <th>Ten dang nhap</th>
                <th>Mat khau</th>
              </tr>
            </thead>
            <tbody>
              {createdUsers.map((u) => (
                <tr key={u.username}>
                  <td>{u.displayName}</td>
                  <td><code>{u.username}</code></td>
                  <td><code>{u.password}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => {
              const text = createdUsers
                .map((u) => `${u.displayName}\t${u.username}\t${u.password}`)
                .join('\n');
              navigator.clipboard.writeText(text);
            }}
          >
            Copy to clipboard
          </button>
          <button
            className="btn btn-sm btn-outline"
            style={{ marginTop: 8, marginLeft: 8 }}
            onClick={() => setCreatedUsers([])}
          >
            Dong
          </button>
        </div>
      )}

      {/* User list */}
      {loading ? (
        <div className="loading-spinner">Dang tai...</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ten dang nhap</th>
                <th>Ten hien thi</th>
                <th>Vai tro</th>
                <th>Trang thai</th>
                <th>Dang nhap cuoi</th>
                <th>Hanh dong</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id} className={!user.isActive ? 'row-disabled' : ''}>
                  <td><code>{user.username}</code></td>
                  <td>{user.displayName}</td>
                  <td>
                    <span className={`badge ${user.role === 'admin' ? 'badge-admin' : ''}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${user.isActive ? 'badge-active' : 'badge-inactive'}`}>
                      {user.isActive ? 'Hoat dong' : 'Da khoa'}
                    </span>
                  </td>
                  <td className="text-muted">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleString('vi-VN')
                      : 'Chua dang nhap'}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-sm"
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.isActive ? 'Khoa' : 'Mo khoa'}
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleResetPassword(user)}
                      >
                        Reset MK
                      </button>
                      {user.role !== 'admin' && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(user)}
                        >
                          Xoa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Truoc
              </button>
              <span>
                Trang {page} / {totalPages}
              </span>
              <button
                className="btn btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Sau
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
