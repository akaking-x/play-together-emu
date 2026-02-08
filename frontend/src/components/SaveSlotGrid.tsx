import { useState, useEffect, useCallback } from 'react';
import { saveManager, type SaveSlotInfo } from '../emulator/save-manager';

interface Props {
  gameId: string;
  onLoad: (slot: number) => void;
  onSave: (slot: number) => void;
  onUpload?: (slot: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleString('vi-VN');
}

export function SaveSlotGrid({ gameId, onLoad, onSave, onUpload }: Props) {
  const [slots, setSlots] = useState<SaveSlotInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await saveManager.getSlots(gameId);
      setSlots(data);
    } catch {
      // Keep existing slots on error
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (slot: number) => {
    if (!confirm('Xoa save state nay?')) return;
    try {
      await saveManager.delete(gameId, slot);
      setSlots(prev =>
        prev.map(s =>
          s.slot === slot
            ? { slot, label: null, fileSize: 0, updatedAt: null, hasScreenshot: false }
            : s,
        ),
      );
    } catch {
      alert('Loi khi xoa save state');
    }
  };

  if (loading) {
    return <div style={{ color: '#aaa', padding: 20 }}>Dang tai...</div>;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
      }}
    >
      {slots.map(slot => (
        <div
          key={slot.slot}
          style={{
            border: '1px solid #333',
            borderRadius: 8,
            padding: 12,
            background: slot.label !== null ? '#1a1a2e' : '#111',
            minHeight: 120,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontWeight: 'bold',
              marginBottom: 8,
              color: '#eee',
              fontSize: 14,
            }}
          >
            Slot {slot.slot + 1}
          </div>

          {slot.label !== null ? (
            <>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                {slot.label || 'Khong co nhan'}
              </div>
              <div style={{ fontSize: 11, color: '#666' }}>
                {formatSize(slot.fileSize)}
              </div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                {formatDate(slot.updatedAt)}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  marginTop: 'auto',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  onClick={() => onLoad(slot.slot)}
                  className="btn btn-sm"
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    background: '#2a7a2a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                >
                  Load
                </button>
                <button
                  onClick={() => onSave(slot.slot)}
                  className="btn btn-sm"
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    background: '#4a9eff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => handleDelete(slot.slot)}
                  className="btn btn-sm"
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    background: '#aa3333',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                >
                  Xoa
                </button>
                {onUpload && (
                  <button
                    onClick={() => onUpload(slot.slot)}
                    className="btn btn-sm"
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      background: '#ff9800',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                  >
                    Upload
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                onClick={() => onSave(slot.slot)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  color: '#666',
                  border: '1px dashed #444',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Save vao slot nay
              </button>
              {onUpload && (
                <button
                  onClick={() => onUpload(slot.slot)}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    color: '#ff9800',
                    border: '1px dashed #ff9800',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Upload file
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
