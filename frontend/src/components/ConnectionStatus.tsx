import type { PeerState } from '../netplay/peer';

export interface PeerInfo {
  peerId: string;
  displayName: string;
  state: PeerState;
  latencyMs: number;
}

interface Props {
  peers: PeerInfo[];
}

function getStatusColor(state: PeerState): string {
  switch (state) {
    case 'connected': return '#4ecdc4';
    case 'connecting': return '#ff6b35';
    case 'disconnected': return '#888';
    case 'failed': return '#ff4444';
    default: return '#555';
  }
}

function getLatencyColor(ms: number): string {
  if (ms < 50) return '#4ecdc4';
  if (ms < 100) return '#ff6b35';
  return '#ff4444';
}

export function ConnectionStatus({ peers }: Props) {
  if (peers.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      background: 'rgba(0, 0, 0, 0.85)',
      border: '1px solid #333',
      borderRadius: 8,
      padding: 10,
      zIndex: 1000,
      minWidth: 160,
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Ket noi</div>
      {peers.map((peer) => (
        <div key={peer.peerId} style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '3px 0',
          fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: getStatusColor(peer.state),
            }} />
            <span style={{ color: '#ccc' }}>
              {peer.displayName || peer.peerId.slice(0, 6)}
            </span>
          </div>
          {peer.state === 'connected' && (
            <span style={{ color: getLatencyColor(peer.latencyMs) }}>
              {peer.latencyMs}ms
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
