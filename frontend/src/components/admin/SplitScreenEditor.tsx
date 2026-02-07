import { useState, useRef } from 'react';
import { api } from '../../api/client';
import type { SplitScreenCheats } from '../../types/split-screen';

interface Props {
  gameId: string;
  gameTitle: string;
  cheats: SplitScreenCheats | null;
  onUpdate: () => void;
}

type PlayerKey = 'player1_fullscreen' | 'player2_fullscreen' | 'player3_fullscreen' | 'player4_fullscreen';
const PLAYER_LABELS: Record<PlayerKey, string> = {
  player1_fullscreen: 'Player 1',
  player2_fullscreen: 'Player 2',
  player3_fullscreen: 'Player 3',
  player4_fullscreen: 'Player 4',
};

export function SplitScreenEditor({ gameId, gameTitle, cheats, onUpdate }: Props) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);
    setWarnings([]);

    try {
      const formData = new FormData();
      formData.append('cheatsFile', file);
      const res = await api.post(`/admin/games/${gameId}/upload-cheats`, formData);
      const data = res.data as { warnings?: string[] };
      setMessage({ type: 'success', text: `Da upload cheats cho "${gameTitle}"` });
      if (data.warnings?.length) setWarnings(data.warnings);
      if (fileRef.current) fileRef.current.value = '';
      onUpdate();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      setMessage({ type: 'error', text: axiosErr.response?.data?.error ?? axiosErr.message ?? 'Loi upload' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Xoa cheats cua "${gameTitle}"? Game se choi split-screen binh thuong.`)) return;
    try {
      await api.delete(`/admin/games/${gameId}/cheats`);
      setMessage({ type: 'success', text: 'Da xoa cheats' });
      setWarnings([]);
      onUpdate();
    } catch {
      setMessage({ type: 'error', text: 'Loi khi xoa cheats' });
    }
  };

  return (
    <div style={{ marginTop: 16, padding: 12, background: '#1a1a2e', borderRadius: 6, border: '1px solid #333' }}>
      <h4 style={{ margin: '0 0 12px', color: '#ddd' }}>Split-Screen Cheats</h4>

      {cheats ? (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="badge">{cheats.splitType}</span>
            {(Object.keys(PLAYER_LABELS) as PlayerKey[]).map(key => {
              const count = cheats.cheats[key]?.length ?? 0;
              if (count === 0) return null;
              return (
                <span key={key} className="badge badge-active">
                  {PLAYER_LABELS[key]}: {count} codes
                </span>
              );
            })}
          </div>

          {/* Show codes for each player */}
          {(Object.keys(PLAYER_LABELS) as PlayerKey[]).map(key => {
            const codes = cheats.cheats[key];
            if (!codes?.length) return null;
            return (
              <div key={key} style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 12, color: '#aaa' }}>{PLAYER_LABELS[key]}:</strong>
                <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', marginLeft: 8 }}>
                  {codes.map((c, i) => (
                    <div key={i}>{c.code} {c.description && `— ${c.description}`}</div>
                  ))}
                </div>
              </div>
            );
          })}

          {cheats.notes && (
            <p style={{ fontSize: 12, color: '#aaa', margin: '8px 0 0' }}>
              Ghi chu: {cheats.notes}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
              Upload lai
              <input
                type="file"
                accept=".json"
                ref={fileRef}
                onChange={handleUpload}
                style={{ display: 'none' }}
              />
            </label>
            <button className="btn btn-sm btn-danger" onClick={handleDelete}>
              Xoa cheats
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: '#888', margin: '0 0 8px' }}>
            Chua co cheats. Game se choi split-screen binh thuong.
            Upload file cheats .json de bat full-screen mod.
          </p>
          <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer' }}>
            {uploading ? 'Dang upload...' : 'Upload cheats (.json)'}
            <input
              type="file"
              accept=".json"
              ref={fileRef}
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}

      {message && (
        <p style={{
          fontSize: 13,
          marginTop: 8,
          marginBottom: 0,
          color: message.type === 'success' ? '#4ecdc4' : message.type === 'error' ? '#ff4444' : '#ffaa00',
        }}>
          {message.text}
        </p>
      )}
      {warnings.map((w, i) => (
        <p key={i} style={{ fontSize: 12, color: '#ffaa00', margin: '4px 0 0' }}>
          Canh bao: {w}
        </p>
      ))}
    </div>
  );
}
