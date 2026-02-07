import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useRoom } from '../hooks/useRoom';
import { PlayerSlot } from '../components/PlayerSlot';
import { ChatBox } from '../components/ChatBox';
import { prefetchROM } from '../utils/prefetch';

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
    sendChat,
  } = useRoom();

  // Prefetch ROM in background while waiting in room
  const games = useGameStore((s) => s.games);
  useEffect(() => {
    if (room?.gameId) {
      const game = games.find((g) => g._id === room.gameId);
      prefetchROM(room.gameId, game?.title);
    }
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
              />
            ))}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            {!isHost && (
              <button
                onClick={() => setReady(!isReady)}
                style={{
                  padding: '10px 24px',
                  background: isReady ? '#888' : '#4ecdc4',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                {isReady ? 'Huy san sang' : 'San sang'}
              </button>
            )}

            {isHost && (
              <button
                onClick={startGame}
                disabled={!allReady}
                style={{
                  padding: '10px 24px',
                  background: allReady ? '#ff6b35' : '#555',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: allReady ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                }}
              >
                Bat dau choi
              </button>
            )}
          </div>

          {isHost && !allReady && (
            <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>
              {room.players.length < 2 ? 'Ban co the bat dau choi mot minh hoac doi them nguoi choi.' : 'Doi tat ca nguoi choi san sang...'}
            </p>
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
