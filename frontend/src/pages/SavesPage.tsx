import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SaveSlotGrid } from '../components/SaveSlotGrid';
import { saveManager } from '../emulator/save-manager';
import { api } from '../api/client';
import type { Game } from '../stores/gameStore';

export function SavesPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!gameId) return;
    const fetchGame = async () => {
      try {
        const res = await api.get(`/games/${gameId}`);
        setGame(res.data as Game);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchGame();
  }, [gameId]);

  const handleLoad = useCallback(async (slot: number) => {
    if (!gameId) return;
    try {
      const data = await saveManager.load(gameId, slot);
      // Download as file for user to keep
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${game?.title || 'save'}_slot${slot + 1}.state`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Loi khi tai save state');
    }
  }, [gameId, game]);

  const handleSave = useCallback(async (slot: number) => {
    if (!gameId) return;
    // Create a file input for uploading a save state file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.state,.sav';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      const label = prompt('Nhan cho save state (de trong neu khong can):') ?? '';
      try {
        await saveManager.save(gameId, slot, new Uint8Array(buffer), label);
        setRefreshKey(k => k + 1);
      } catch {
        alert('Loi khi upload save state');
      }
    };
    input.click();
  }, [gameId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
        Dang tai...
      </div>
    );
  }

  if (!gameId) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: '#ff4444' }}>Khong tim thay game</p>
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: 16,
            padding: '8px 20px',
            background: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Ve trang chu
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Save States</h1>
            <p className="text-muted">
              {game ? game.title : 'Game'} - Quan ly save states (8 slots)
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '8px 20px',
              background: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Quay lai
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 13, color: '#888', marginBottom: 16 }}>
        Load: tai save state ve may | Save: upload file .state tu may
      </div>

      <SaveSlotGrid
        key={refreshKey}
        gameId={gameId}
        onLoad={handleLoad}
        onSave={handleSave}
      />
    </div>
  );
}
