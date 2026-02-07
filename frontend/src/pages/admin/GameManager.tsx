import { useEffect, useState, useRef, type FormEvent } from 'react';
import axios from 'axios';
import { api } from '../../api/client';
import type { Game } from '../../stores/gameStore';

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB — safe under Cloudflare's 100MB limit

type UploadMode = 'cloudflare' | 'direct';

export function GameManager() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadTotalBytes, setUploadTotalBytes] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Upload mode
  const [uploadMode, setUploadMode] = useState<UploadMode>(
    () => (localStorage.getItem('uploadMode') as UploadMode) || 'cloudflare'
  );
  const [directUrl, setDirectUrl] = useState(
    () => localStorage.getItem('directUploadUrl') || ''
  );

  // Upload form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [discId, setDiscId] = useState('');
  const [region, setRegion] = useState('US');
  const [genre, setGenre] = useState('');
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [description, setDescription] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/games');
      const data = res.data as { games?: Game[] } | Game[];
      setGames(Array.isArray(data) ? data : (data.games ?? []));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  // Save upload mode preferences
  useEffect(() => {
    localStorage.setItem('uploadMode', uploadMode);
  }, [uploadMode]);
  useEffect(() => {
    localStorage.setItem('directUploadUrl', directUrl);
  }, [directUrl]);

  const resetForm = () => {
    setTitle('');
    setSlug('');
    setDiscId('');
    setRegion('US');
    setGenre('');
    setMinPlayers(2);
    setMaxPlayers(2);
    setDescription('');
    if (fileRef.current) fileRef.current.value = '';
    setEditingId(null);
  };

  const getToken = () => localStorage.getItem('token') || '';
  const getSlugValue = () => slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Create an axios instance for the chosen upload target
  const getUploadClient = () => {
    if (uploadMode === 'direct' && directUrl.trim()) {
      const baseURL = directUrl.trim().replace(/\/+$/, '') + '/api';
      const client = axios.create({ baseURL });
      client.interceptors.request.use((cfg) => {
        cfg.headers.Authorization = `Bearer ${getToken()}`;
        return cfg;
      });
      return client;
    }
    return api;
  };

  // Normal single-request upload (small files or direct mode)
  const uploadNormal = async (file: File) => {
    const client = getUploadClient();
    const formData = new FormData();
    formData.append('rom', file);
    formData.append('title', title);
    formData.append('slug', getSlugValue());
    formData.append('discId', discId);
    formData.append('region', region);
    formData.append('genre', genre);
    formData.append('minPlayers', String(minPlayers));
    formData.append('maxPlayers', String(maxPlayers));
    formData.append('description', description);

    setUploadStatus('Dang upload...');
    await client.post('/admin/games', formData, {
      timeout: 600000,
      onUploadProgress: (evt) => {
        setUploadedBytes(evt.loaded);
        const total = evt.total ?? file.size;
        if (total > 0) {
          setUploadProgress(Math.round((evt.loaded / total) * 100));
        }
      },
    });
  };

  // Chunked upload (for large files through Cloudflare)
  const uploadChunked = async (file: File) => {
    const client = getUploadClient();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Init session
    setUploadStatus(`Khoi tao upload (${totalChunks} phan)...`);
    const initRes = await client.post('/admin/games/upload/init', {
      filename: file.name,
      fileSize: file.size,
      totalChunks,
    });
    const { sessionId } = initRes.data as { sessionId: string };

    // 2. Upload chunks sequentially
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkSize = end - start;

      setUploadStatus(`Dang upload phan ${i + 1}/${totalChunks}...`);

      const formData = new FormData();
      formData.append('chunk', chunk, `chunk_${i}`);

      await client.post(`/admin/games/upload/chunk/${sessionId}/${i}`, formData, {
        timeout: 600000,
        onUploadProgress: (evt) => {
          const chunkProgress = evt.loaded / (evt.total ?? chunkSize);
          const overallBytes = start + Math.round(chunkProgress * chunkSize);
          setUploadedBytes(overallBytes);
          setUploadProgress(Math.round((overallBytes / file.size) * 100));
        },
      });
    }

    // 3. Complete — assemble on server
    setUploadStatus('Dang ghep file tren server...');
    setUploadProgress(100);
    await client.post(`/admin/games/upload/complete/${sessionId}`, {
      title,
      slug: getSlugValue(),
      discId,
      region,
      genre,
      minPlayers: String(minPlayers),
      maxPlayers: String(maxPlayers),
      description,
    });
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadTotalBytes(file.size);
    setUploadError(null);
    setUploadStatus('');

    try {
      const needChunked = uploadMode === 'cloudflare' && file.size > CHUNK_SIZE;
      if (needChunked) {
        await uploadChunked(file);
      } else {
        await uploadNormal(file);
      }
      resetForm();
      fetchGames();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      setUploadError(axiosErr.response?.data?.error ?? axiosErr.message ?? 'Upload that bai');
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    await api.patch(`/admin/games/${editingId}`, {
      title,
      slug,
      discId,
      region,
      genre,
      minPlayers,
      maxPlayers,
      description,
    });
    resetForm();
    fetchGames();
  };

  const handleToggleActive = async (game: Game) => {
    await api.patch(`/admin/games/${game._id}`, { isActive: !game.isActive });
    fetchGames();
  };

  const handleDelete = async (game: Game) => {
    if (!window.confirm(`Xoa game "${game.title}"?`)) return;
    await api.delete(`/admin/games/${game._id}`);
    fetchGames();
  };

  const startEditing = (game: Game) => {
    setEditingId(game._id);
    setTitle(game.title);
    setSlug(game.slug);
    setDiscId(game.discId);
    setRegion(game.region);
    setGenre(game.genre);
    setMinPlayers(game.minPlayers);
    setMaxPlayers(game.maxPlayers);
    setDescription(game.description);
  };

  const formatSize = (bytes: number) =>
    bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  return (
    <div>
      <div className="page-header">
        <h1>Quan ly game</h1>
      </div>

      {/* Upload / Edit form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3>{editingId ? 'Chinh sua game' : 'Them game moi'}</h3>
        <form onSubmit={editingId ? handleEdit : handleUpload} className="game-form">
          <div className="form-row">
            <div className="form-group">
              <label>Ten game *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Chocobo Racing"
                required
              />
            </div>
            <div className="form-group">
              <label>Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="VD: chocobo-racing"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Disc ID</label>
              <input
                type="text"
                value={discId}
                onChange={(e) => setDiscId(e.target.value)}
                placeholder="VD: SLUS-00577"
              />
            </div>
            <div className="form-group">
              <label>Khu vuc</label>
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="US">US</option>
                <option value="EU">EU</option>
                <option value="JP">JP</option>
              </select>
            </div>
            <div className="form-group">
              <label>The loai</label>
              <input
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="VD: Racing"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>So nguoi choi toi thieu</label>
              <input
                type="number"
                min={1}
                max={8}
                value={minPlayers}
                onChange={(e) => setMinPlayers(parseInt(e.target.value) || 2)}
              />
            </div>
            <div className="form-group">
              <label>So nguoi choi toi da</label>
              <input
                type="number"
                min={1}
                max={8}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value) || 2)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Mo ta</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mo ta game..."
              rows={3}
            />
          </div>

          {!editingId && (
            <>
              <div className="form-group">
                <label>File ROM *</label>
                <input type="file" ref={fileRef} accept=".bin,.cue,.iso,.img,.pbp" required />
              </div>

              {/* Upload mode selector */}
              <div className="form-group">
                <label>Che do upload</label>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="uploadMode"
                      value="cloudflare"
                      checked={uploadMode === 'cloudflare'}
                      onChange={() => setUploadMode('cloudflare')}
                    />
                    Qua Cloudflare (tu dong chia nho file &gt;50MB)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="uploadMode"
                      value="direct"
                      checked={uploadMode === 'direct'}
                      onChange={() => setUploadMode('direct')}
                    />
                    Truc tiep (VPS IP, khong gioi han dung luong)
                  </label>
                </div>
              </div>

              {uploadMode === 'direct' && (
                <div className="form-group">
                  <label>URL VPS (VD: http://103.82.39.35:8090)</label>
                  <input
                    type="text"
                    value={directUrl}
                    onChange={(e) => setDirectUrl(e.target.value)}
                    placeholder="http://IP:PORT"
                    required
                  />
                </div>
              )}
            </>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading
                ? `Dang upload... ${uploadProgress}%`
                : editingId
                  ? 'Luu thay doi'
                  : 'Upload game'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-outline" onClick={resetForm}>
                Huy
              </button>
            )}
          </div>
          {uploading && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                width: '100%',
                height: 6,
                background: '#333',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  background: uploadProgress < 100 ? '#4a9eff' : '#4ecdc4',
                  borderRadius: 3,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 12, color: '#aaa', marginTop: 4, display: 'inline-block' }}>
                {uploadProgress < 100
                  ? `${uploadProgress}% — ${formatSize(uploadedBytes)} / ${formatSize(uploadTotalBytes)}`
                  : uploadStatus || 'Dang xu ly tren server...'}
                {uploadStatus && uploadProgress < 100 && (
                  <> — {uploadStatus}</>
                )}
              </span>
            </div>
          )}
          {uploadError && (
            <p style={{ color: '#ff4444', marginTop: 8, marginBottom: 0, fontSize: 13 }}>
              {uploadError}
            </p>
          )}
        </form>
      </div>

      {/* Game list */}
      {loading ? (
        <div className="loading-spinner">Dang tai...</div>
      ) : games.length === 0 ? (
        <div className="empty-state">Chua co game nao.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Ten game</th>
              <th>Khu vuc</th>
              <th>The loai</th>
              <th>So nguoi choi</th>
              <th>ROM</th>
              <th>Trang thai</th>
              <th>Hanh dong</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game._id} className={!game.isActive ? 'row-disabled' : ''}>
                <td>
                  <strong>{game.title}</strong>
                  <br />
                  <span className="text-muted text-sm">{game.slug}</span>
                </td>
                <td><span className="badge">{game.region}</span></td>
                <td>{game.genre || '-'}</td>
                <td>{game.minPlayers}-{game.maxPlayers}</td>
                <td className="text-muted text-sm">
                  {game.romFilename}
                  <br />
                  {formatSize(game.romSizeBytes)}
                </td>
                <td>
                  <span className={`badge ${game.isActive ? 'badge-active' : 'badge-inactive'}`}>
                    {game.isActive ? 'Hien' : 'An'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-sm" onClick={() => startEditing(game)}>
                      Sua
                    </button>
                    <button className="btn btn-sm" onClick={() => handleToggleActive(game)}>
                      {game.isActive ? 'An' : 'Hien'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(game)}>
                      Xoa
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
