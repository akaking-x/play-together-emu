import { useState, useRef, useEffect } from 'react';

export interface ChatMessage {
  fromId: string;
  displayName: string;
  message: string;
  timestamp: number;
}

interface Props {
  messages: ChatMessage[];
  onSend: (message: string) => void;
}

export function ChatBox({ messages, onSend }: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      border: '1px solid #333',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      height: 300,
      background: '#111',
    }}>
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
            Chua co tin nhan nao
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ fontSize: 13 }}>
            <span style={{ color: '#666', fontSize: 11, marginRight: 4 }}>
              {formatTime(msg.timestamp)}
            </span>
            <span style={{ color: '#4ecdc4', fontWeight: 'bold', marginRight: 4 }}>
              {msg.displayName}:
            </span>
            <span style={{ color: '#ddd' }}>{msg.message}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        borderTop: '1px solid #333',
      }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhap tin nhan..."
          style={{
            flex: 1,
            padding: '8px 12px',
            background: '#1a1a2e',
            border: 'none',
            color: '#fff',
            outline: 'none',
          }}
        />
        <button type="submit" style={{
          padding: '8px 16px',
          background: '#4ecdc4',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
        }}>
          Gui
        </button>
      </form>
    </div>
  );
}
