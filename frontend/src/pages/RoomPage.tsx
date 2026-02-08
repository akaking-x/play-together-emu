import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useRoom } from '../hooks/useRoom';
import { PlayerSlot } from '../components/PlayerSlot';
import { ChatBox } from '../components/ChatBox';
import { SaveSlotGrid } from '../components/SaveSlotGrid';
import { prefetchROMWithProgress } from '../utils/prefetch';
import { saveManager } from '../emulator/save-manager';

export function RoomPage() {
  useParams(); // keep route param matching active
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const {
    room,
    messages,
    connected,
    error,
    gameStarting,
    isHost,
    isReady,
    allReady,
    leaveRoom,
    setReady,
    startGame,
    transferHost,
    sendChat,
  } = useRoom();

  const [romProgress, setRomProgress] = useState<number>(0);
  const [romCached, setRomCached] = useState(false);

  // Save state selection & upload
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [saveRefreshKey, setSaveRefreshKey] = useState(0);
  const [showSaves, setShowSaves] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadSlotRef = useRef<number>(0);

  const handleSelectSlot = (slot: number) => {
    if (!room?.gameId) return;
    setSelectedSlot(slot);
    sessionStorage.setItem('pendingSaveLoad', JSON.stringify({ gameId: room.gameId, slot }));
  };

  const handleUploadToSlot = (slot: number) => {
    uploadSlotRef.current = slot;
    uploadInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !room?.gameId) return;
    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const slot = uploadSlotRef.current;
      await saveManager.save(room.gameId, slot, data, `Uploaded: ${file.name}`);
      setSaveRefreshKey((k) => k + 1);
      handleSelectSlot(slot);
    } catch {
      alert('Upload that bai');
    }
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  // Prefetch ROM with progress tracking
  const games = useGameStore((s) => s.games);
  useEffect(() => {
    if (!room?.gameId) return;
    const game = games.find((g) => g._id === room.gameId);
    const { promise, abort } = prefetchROMWithProgress(
      room.gameId,
      game?.title,
      (pct) => setRomProgress(pct),
    );
    promise.then((ok) => setRomCached(ok));
    return () => abort();
  }, [room?.gameId, games]);

  // Navigate to game when game starts
  useEffect(() => {
    if (gameStarting && room?.gameId) {
      navigate(`/game/${room.gameId}`);
    }
  }, [gameStarting, room?.gameId, navigate]);

  // If we don't have a room, we need to join via lobby
  if (!room) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: '#888' }}>
          {connected ? 'Khong tim thay phong. Hay quay lai lobby.' : 'Dang ket noi...'}
        </p>
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

  const maxSlots = room.maxPlayers;
  const slots = Array.from({ length: maxSlots }, (_, i) => {
    const player = room.players.find((p) => p.controllerPort === i);
    return { port: i, player: player ?? null };
  });

  const handleLeave = () => {
    leaveRoom();
    navigate(`/lobby/${room.gameId}`);
  };

  const canStart = allReady && romCached;

  return (
    <div>
      {/* Room header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>{room.roomName}</h1>
          <p style={{ color: '#888', margin: '4px 0 0' }}>
            {room.players.length}/{room.maxPlayers} nguoi choi
            {room.isPrivate && room.roomCode && (
              <span style={{ marginLeft: 12 }}>
                Ma phong: <strong style={{ color: '#4ecdc4' }}>{room.roomCode}</strong>
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleLeave}
          style={{
            padding: '8px 20px',
            background: '#ff4444',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Roi phong
        </button>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 20 }}>
        {/* Left: Player slots + actions */}
        <div>
          <h3 style={{ margin: '0 0 12px' }}>Nguoi choi</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}>
            {slots.map((s) => (
              <PlayerSlot
                key={s.port}
                player={s.player}
                port={s.port}
                isHost={s.player?.userId === room.hostId}
                isCurrentUser={s.player?.userId === user?.id}
                canTransferHost={isHost}
                onTransferHost={transferHost}
              />
            ))}
          </div>

          {/* ROM download progress */}
          {!romCached && (
            <div style={{
              marginBottom: 16,
              padding: '10px 16px',
              background: '#1a1a2e',
              border: '1px solid #333',
              borderRadius: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#aaa', fontSize: 13 }}>Dang tai game...</span>
                <span style={{ color: '#4ecdc4', fontSize: 13, fontWeight: 'bold' }}>{romProgress}%</span>
              </div>
              <div style={{
                width: '100%',
                height: 6,
                background: '#333',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${romProgress}%`,
                  height: '100%',
                  background: '#4ecdc4',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {romCached && (
            <div style={{
              marginBottom: 16,
              padding: '8px 16px',
              background: '#1a2e1a',
              border: '1px solid #2a5a2a',
              borderRadius: 6,
              color: '#4ecd6a',
              fontSize: 13,
            }}>
              Game da san sang
            </div>
          )}

          {/* Save state selection — host only */}
          {isHost && room?.gameId && (
          <div style={{
            marginBottom: 16,
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setShowSaves((v) => !v)}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'transparent',
                color: '#eee',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 14,
              }}
            >
              <span>
                Save state
                {selectedSlot != null && (
                  <span style={{ color: '#4ecdc4', marginLeft: 8, fontSize: 12 }}>
                    Slot {selectedSlot + 1} da chon
                  </span>
                )}
              </span>
              <span style={{ color: '#888' }}>{showSaves ? '▲' : '▼'}</span>
            </button>
            {showSaves && (
              <div style={{ padding: '0 16px 16px' }}>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".state,.sav,.mcr,.srm,.ss0,.ss1,.ss2,.ss3,.ss4,.ss5,.ss6,.ss7,.ss8,.ss9"
                  onChange={handleFileSelected}
                  style={{ display: 'none' }}
                />
                <SaveSlotGrid
                  gameId={room.gameId}
                  onLoad={handleSelectSlot}
                  onUpload={handleUploadToSlot}
                  selectedSlot={selectedSlot}
                  loadLabel="Chon"
                  refreshKey={saveRefreshKey}
                />
                {selectedSlot != null && (
                  <div style={{
                    marginTop: 10,
                    padding: '6px 12px',
                    background: '#1a2e2e',
                    border: '1px solid #2a5a5a',
                    borderRadius: 4,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ color: '#4ecdc4', fontSize: 12 }}>
                      Slot {selectedSlot + 1} se duoc tu dong load khi bat dau game.
                    </span>
                    <button
                      onClick={() => {
                        setSelectedSlot(null);
                        sessionStorage.removeItem('pendingSaveLoad');
                      }}
                      style={{
                        padding: '2px 8px',
                        background: 'transparent',
                        color: '#888',
                        border: '1px solid #555',
                        borderRadius: 3,
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      Bo chon
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            {!isHost && (
              <button
                onClick={() => setReady(!isReady)}
                disabled={!romCached}
                style={{
                  padding: '10px 24px',
                  background: !romCached ? '#555' : isReady ? '#888' : '#4ecdc4',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: !romCached ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                }}
              >
                {!romCached
                  ? `Dang tai game... ${romProgress}%`
                  : isReady ? 'Huy san sang' : 'San sang'}
              </button>
            )}

            {isHost && (
              <button
                onClick={startGame}
                disabled={!canStart}
                style={{
                  padding: '10px 24px',
                  background: canStart ? '#ff6b35' : '#555',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: canStart ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                }}
              >
                {!romCached ? `Dang tai game... ${romProgress}%` : 'Bat dau choi'}
              </button>
            )}
          </div>

          {isHost && !canStart && (
            <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>
              {!romCached
                ? 'Dang tai game, vui long doi...'
                : room.players.length < 2 ? 'Ban co the bat dau choi mot minh hoac doi them nguoi choi.' : 'Doi tat ca nguoi choi san sang...'}
            </p>
          )}

          {room.players.length > 1 && (
            <div style={{
              marginTop: 16,
              padding: '10px 16px',
              background: '#1a1a2e',
              border: '1px solid #333',
              borderRadius: 6,
              fontSize: 13,
            }}>
              <span style={{ color: '#888' }}>Che do multiplayer: </span>
              <span style={{ color: '#4ecdc4', fontWeight: 'bold' }}>EmulatorJS Netplay</span>
              <p style={{ color: '#666', fontSize: 12, margin: '6px 0 0' }}>
                Moi nguoi chay emulator rieng. Dung nut Netplay trong game de ket noi.
              </p>
            </div>
          )}
        </div>

        {/* Right: Chat */}
        <div>
          <h3 style={{ margin: '0 0 12px' }}>Chat</h3>
          <ChatBox messages={messages} onSend={sendChat} />
        </div>
      </div>
    </div>
  );
}
