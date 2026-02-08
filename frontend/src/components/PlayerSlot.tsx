interface Player {
  userId: string;
  displayName: string;
  controllerPort: number;
  isReady: boolean;
}

interface Props {
  player: Player | null;
  port: number;
  isHost: boolean;
  isCurrentUser: boolean;
  canTransferHost?: boolean;
  onTransferHost?: (userId: string) => void;
}

export function PlayerSlot({ player, port, isHost, isCurrentUser, canTransferHost, onTransferHost }: Props) {
  return (
    <div style={{
      border: `1px solid ${player ? (player.isReady ? '#4ecdc4' : '#ff6b35') : '#333'}`,
      borderRadius: 8,
      padding: 16,
      background: player ? '#1a1a2e' : '#111',
      minHeight: 80,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        top: 6,
        left: 8,
        fontSize: 11,
        color: '#666',
      }}>
        P{port + 1}
      </div>

      {isHost && player && (
        <div style={{
          position: 'absolute',
          top: 6,
          right: 8,
          fontSize: 10,
          background: '#ff6b35',
          color: '#fff',
          padding: '1px 5px',
          borderRadius: 3,
        }}>
          Host
        </div>
      )}

      {player ? (
        <>
          <div style={{
            fontWeight: isCurrentUser ? 'bold' : 'normal',
            color: isCurrentUser ? '#4ecdc4' : '#fff',
          }}>
            {player.displayName || player.userId.slice(0, 8)}
          </div>
          <div style={{
            fontSize: 12,
            color: player.isReady ? '#4ecdc4' : '#888',
          }}>
            {player.isReady ? 'San sang' : 'Chua san sang'}
          </div>
          {canTransferHost && !isHost && onTransferHost && (
            <button
              onClick={() => onTransferHost(player.userId)}
              style={{
                marginTop: 4,
                padding: '2px 8px',
                fontSize: 10,
                background: 'transparent',
                color: '#ff9800',
                border: '1px solid #ff9800',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              Chuyen host
            </button>
          )}
        </>
      ) : (
        <div style={{ color: '#555', fontSize: 13 }}>
          Trong
        </div>
      )}
    </div>
  );
}
