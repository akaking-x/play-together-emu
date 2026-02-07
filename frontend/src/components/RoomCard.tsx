import type { SignalingRoom } from '../netplay/signaling';

interface Props {
  room: SignalingRoom;
  onJoin: (roomId: string) => void;
}

export function RoomCard({ room, onJoin }: Props) {
  const isFull = room.players.length >= room.maxPlayers;

  return (
    <div style={{
      border: '1px solid #444',
      borderRadius: 8,
      padding: 16,
      background: '#1a1a2e',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{room.roomName}</h3>
        {room.isPrivate && (
          <span style={{
            fontSize: 11,
            background: '#ff6b35',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: 4,
          }}>
            Private
          </span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#aaa' }}>
        <span>
          {room.players.length}/{room.maxPlayers} nguoi choi
        </span>
        <span style={{
          color: room.status === 'waiting' ? '#4ecdc4' : '#ff6b35',
        }}>
          {room.status === 'waiting' ? 'Dang cho' : 'Dang choi'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {room.players.map((p) => (
          <span key={p.userId} style={{
            fontSize: 11,
            background: '#333',
            padding: '2px 6px',
            borderRadius: 4,
          }}>
            {p.displayName || p.userId.slice(0, 6)}
          </span>
        ))}
      </div>

      <button
        onClick={() => onJoin(room.id)}
        disabled={isFull || room.status !== 'waiting'}
        style={{
          marginTop: 4,
          padding: '8px 16px',
          background: isFull || room.status !== 'waiting' ? '#555' : '#4ecdc4',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: isFull || room.status !== 'waiting' ? 'not-allowed' : 'pointer',
        }}
      >
        {isFull ? 'Phong day' : room.status !== 'waiting' ? 'Dang choi' : 'Vao phong'}
      </button>
    </div>
  );
}
