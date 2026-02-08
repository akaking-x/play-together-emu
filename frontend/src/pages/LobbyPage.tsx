import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore, type Game } from '../stores/gameStore';
import { useRoom } from '../hooks/useRoom';
import { RoomCard } from '../components/RoomCard';
import { api } from '../api/client';

function generateRoomName(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let name = '';
  for (let i = 0; i < 6; i++) {
    name += chars[Math.floor(Math.random() * chars.length)];
  }
  return name;
}

export function LobbyPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { rooms, connected, error, room, listRooms, createRoom, joinRoom } = useRoom();

  const [game, setGame] = useState<Game | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinRoomId, setJoinRoomId] = useState<string | null>(null);

  const setCurrentGame = useGameStore((s) => s.setCurrentGame);

  // Fetch game info
  useEffect(() => {
    if (!gameId) return;
    api.get(`/games/${gameId}`).then((res) => {
      const g = res.data as Game;
      setGame(g);
      setCurrentGame(g);
      setMaxPlayers(g.maxPlayers);
    });
  }, [gameId, setCurrentGame]);

  // Fetch room list when connected
  useEffect(() => {
    if (!connected || !gameId) return;
    listRooms(gameId);
    const interval = setInterval(() => listRooms(gameId), 5000);
    return () => clearInterval(interval);
  }, [connected, gameId, listRooms]);

  // Navigate to room when joined
  useEffect(() => {
    if (room) {
      navigate(`/room/${room.id}`);
    }
  }, [room, navigate]);

  const [creating, setCreating] = useState(false);

  const handleCreate = () => {
    if (!gameId || !connected || creating) return;
    setCreating(true);
    const name = roomName.trim() || generateRoomName();
    createRoom(gameId, name, maxPlayers, isPrivate);
    // Reset after a short delay to allow WS to respond
    setTimeout(() => setCreating(false), 2000);
    setShowCreate(false);
    setRoomName('');
  };

  const handleJoin = (roomId: string) => {
    const targetRoom = rooms.find((r) => r.id === roomId);
    if (targetRoom?.isPrivate) {
      setJoinRoomId(roomId);
    } else {
      joinRoom(roomId);
    }
  };

  const handlePrivateJoin = () => {
    if (joinRoomId && joinCode.trim()) {
      joinRoom(joinRoomId, joinCode.trim());
      setJoinRoomId(null);
      setJoinCode('');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>{game?.title ?? 'Loading...'}</h1>
          <p style={{ color: '#888', margin: '4px 0 0' }}>
            {game ? `${game.minPlayers}-${game.maxPlayers} nguoi choi` : ''}
            {!connected && ' | Dang ket noi...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => listRooms(gameId!)}
            disabled={!connected}
            style={{
              padding: '8px 16px',
              background: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Lam moi
          </button>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!connected}
            style={{
              padding: '8px 16px',
              background: '#4ecdc4',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Tao phong
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '8px 16px',
          background: '#ff4444',
          color: '#fff',
          borderRadius: 4,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Create room dialog */}
      {showCreate && (
        <div style={{
          border: '1px solid #444',
          borderRadius: 8,
          padding: 20,
          background: '#1a1a2e',
          marginBottom: 20,
          position: 'relative',
        }}>
          {!connected && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
              color: '#ff6b35',
              fontWeight: 'bold',
              fontSize: 14,
            }}>
              Dang ket noi... Vui long doi
            </div>
          )}
          <h3 style={{ margin: '0 0 16px' }}>Tao phong moi</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#aaa' }}>
                Ten phong
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="De trong de tao ten tu dong..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#333',
                  border: '1px solid #555',
                  borderRadius: 4,
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#aaa' }}>
                So nguoi choi toi da
              </label>
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#333',
                  border: '1px solid #555',
                  borderRadius: 4,
                  color: '#fff',
                }}
              >
                {Array.from({ length: game?.maxPlayers ?? 2 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n} nguoi</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#aaa' }}>
                Che do multiplayer
              </label>
              <div style={{
                padding: '8px 12px',
                background: '#2a2a3e',
                border: '1px solid #555',
                borderRadius: 4,
                color: '#4ecdc4',
                fontSize: 13,
              }}>
                EmulatorJS Netplay — Moi nguoi chay emulator rieng, dong bo qua mang
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Phong rieng tu (can ma de vao)</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCreate}
                disabled={!connected || creating}
                style={{
                  padding: '8px 20px',
                  background: (!connected || creating) ? '#555' : '#4ecdc4',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: (!connected || creating) ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? 'Dang tao...' : 'Tao phong'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  padding: '8px 20px',
                  background: '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Huy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room code dialog */}
      {joinRoomId && (
        <div style={{
          border: '1px solid #444',
          borderRadius: 8,
          padding: 20,
          background: '#1a1a2e',
          marginBottom: 20,
        }}>
          <h3 style={{ margin: '0 0 12px' }}>Nhap ma phong</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Ma phong (6 ky tu)"
              maxLength={6}
              style={{
                padding: '8px 12px',
                background: '#333',
                border: '1px solid #555',
                borderRadius: 4,
                color: '#fff',
                width: 180,
              }}
            />
            <button
              onClick={handlePrivateJoin}
              disabled={joinCode.length < 1}
              style={{
                padding: '8px 16px',
                background: '#4ecdc4',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Vao
            </button>
            <button
              onClick={() => { setJoinRoomId(null); setJoinCode(''); }}
              style={{
                padding: '8px 16px',
                background: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Huy
            </button>
          </div>
        </div>
      )}

      {/* Room list */}
      {rooms.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#666', padding: 40 }}>
          Chua co phong nao. Hay tao phong moi!
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {rooms.map((r) => (
            <RoomCard key={r.id} room={r} onJoin={handleJoin} />
          ))}
        </div>
      )}
    </div>
  );
}
