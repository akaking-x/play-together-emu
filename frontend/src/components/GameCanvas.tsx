import { useEffect, useRef, useState, useCallback } from 'react';
import { useEmulator } from '../hooks/useEmulator';
import type { EmulatorCore } from '../emulator/core';
import { DinoRunner } from './DinoRunner';

interface Props {
  romUrl: string;
  biosUrl?: string;
  onReady?: () => void;
  onEmulatorRef?: (emulator: EmulatorCore | null) => void;
}

const CONTAINER_ID = 'ejs-game-container';

export function GameCanvas({ romUrl, biosUrl, onReady, onEmulatorRef }: Props) {
  const { emulator, state, error } = useEmulator({
    containerId: CONTAINER_ID,
    romUrl,
    biosUrl,
  });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (state === 'running' && onReady) {
      onReady();
    }
  }, [state, onReady]);

  useEffect(() => {
    onEmulatorRef?.(emulator);
  }, [emulator, onEmulatorRef]);

  // Listen for fullscreen changes (e.g. user presses Escape)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current.requestFullscreen();
    }
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {/* EmulatorJS takes over this div and creates its own canvas + UI */}
      <div
        id={CONTAINER_ID}
        style={{
          width: '100%',
          maxWidth: isFullscreen ? undefined : 800,
          aspectRatio: '4/3',
          background: '#000',
          borderRadius: isFullscreen ? 0 : 8,
          overflow: 'hidden',
          margin: '0 auto',
          height: isFullscreen ? '100vh' : undefined,
        }}
      />

      {state === 'running' && (
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Thoat toan man hinh (Esc)' : 'Toan man hinh'}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 32,
            height: 32,
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            zIndex: 10,
            opacity: 0.7,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
        >
          {isFullscreen ? '\u2716' : '\u26F6'}
        </button>
      )}

      {(state === 'idle' || state === 'loading') && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#000',
            borderRadius: 8,
            overflow: 'hidden',
            zIndex: 50,
          }}
        >
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <DinoRunner />
          </div>
          <p style={{ color: '#888', fontSize: 12, margin: 0, padding: '8px 0', textAlign: 'center' }}>
            Dang tai game... Game se tu dong bat dau khi san sang.
          </p>
        </div>
      )}

      {state === 'error' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.9)',
            borderRadius: 8,
            color: '#ff4444',
            fontSize: 16,
            padding: 20,
            textAlign: 'center',
            zIndex: 50,
          }}
        >
          Loi: {error || 'Khong the tai emulator'}
        </div>
      )}
    </div>
  );
}
