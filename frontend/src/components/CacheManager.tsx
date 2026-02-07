import { useState, useEffect, useCallback } from 'react';
import {
  isCacheAPIAvailable,
  getCachedROMs,
  deleteCachedROM,
  clearAllCachedROMs,
  type CachedROMEntry,
} from '../utils/prefetch';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function CacheManager() {
  const [entries, setEntries] = useState<CachedROMEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await getCachedROMs();
    setEntries(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (gameId: string) => {
    await deleteCachedROM(gameId);
    setEntries(prev => prev.filter(e => e.gameId !== gameId));
  };

  const handleClearAll = async () => {
    if (!confirm('Xoa tat ca ROM da cache? Hanh dong nay khong the hoan tac.')) return;
    await clearAllCachedROMs();
    setEntries([]);
  };

  if (!isCacheAPIAvailable()) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>Bo nho cache ROM</h3>
        <p style={{ color: '#888' }}>
          Trinh duyet khong ho tro Cache API. Khong the quan ly ROM cache.
        </p>
      </div>
    );
  }

  const totalSize = entries.reduce((sum, e) => sum + e.sizeBytes, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Bo nho cache ROM</h3>
        {entries.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: '#aaa', fontSize: 13 }}>
              {entries.length} ROM da cache — {formatBytes(totalSize)}
            </span>
            <button
              onClick={handleClearAll}
              style={{
                padding: '4px 12px',
                background: '#aa3333',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Xoa tat ca
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#aaa' }}>Dang tai...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: '#666' }}>Chua co ROM nao duoc cache.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(entry => (
            <div
              key={entry.gameId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 12,
                background: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: 8,
              }}
            >
              <div>
                <div style={{ color: '#eee', fontWeight: 'bold', marginBottom: 4 }}>
                  {entry.title}
                </div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {formatBytes(entry.sizeBytes)}
                  {entry.cachedAt && ` — ${formatDate(entry.cachedAt)}`}
                </div>
              </div>
              <button
                onClick={() => handleDelete(entry.gameId)}
                style={{
                  padding: '4px 10px',
                  background: '#aa3333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Xoa
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
