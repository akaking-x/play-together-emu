import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GameCanvas } from '../components/GameCanvas';
import { GuestVideoPlayer } from '../components/GuestVideoPlayer';
import { SaveSlotGrid } from '../components/SaveSlotGrid';
import { KeyMapper } from '../components/KeyMapper';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { DinoRunner } from '../components/DinoRunner';
import { InputMapper, DEFAULT_KEYMAP } from '../emulator/input-mapper';
import type { EmulatorCore } from '../emulator/core';
import { saveManager } from '../emulator/save-manager';
import { useNetplay } from '../hooks/useNetplay';
import { useGameLoop } from '../hooks/useGameLoop';
import { useRoomStore } from '../stores/roomStore';
import { useAuthStore } from '../stores/authStore';
import { useRoom } from '../hooks/useRoom';
import { applyCheats, removeCheats, getPlayerNumber } from '../emulator/split-screen';
import { api } from '../api/client';
import type { Game } from '../stores/gameStore';

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [romUrl, setRomUrl] = useState<string | null>(null);
  const [showSaves, setShowSaves] = useState(false);
  const [showKeyMapper, setShowKeyMapper] = useState(false);
  const [saveRefreshKey, setSaveRefreshKey] = useState(0);
  const [keyMapping, setKeyMapping] = useState<Record<string, string>>(DEFAULT_KEYMAP);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputMapperRef = useRef<InputMapper | null>(null);
  const [emulatorInstance, setEmulatorInstance] = useState<EmulatorCore | null>(null);

  // Multiplayer state from stores
  const { room, client, gameStarting } = useRoomStore();
  const connected = useRoomStore((s) => s.connected);
  const peerDisconnected = useRoomStore((s) => s.peerDisconnected);
  const reconnectState = useRoomStore((s) => s.reconnectState);
  const clearReconnectState = useRoomStore((s) => s.clearReconnectState);
  const gameSynced = useRoomStore((s) => s.gameSynced);
  const loadedPlayers = useRoomStore((s) => s.loadedPlayers);
  const { leaveRoom } = useRoom();
  const user = useAuthStore((s) => s.user);
  const localUserId = user?.id ?? '';
  const [countdown, setCountdown] = useState<number | null>(null);
  const [waitingForSync, setWaitingForSync] = useState(false);
  const sentReadyRef = useRef(false);

  const isMultiplayer = !!(room && room.players.length > 1 && gameStarting);
  const isHost = !!(room && room.hostId === localUserId);

  // Remote video stream for guest
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const streamCapturedRef = useRef(false);

  // Bridge client to a RefObject for useNetplay
  const clientRef = useRef(client);
  clientRef.current = client;

  // WebRTC peer connections
  const { peerInfos, sendToAll, setOnData, replaceTrackOnAll } = useNetplay({
    signalingClient: clientRef,
    localUserId,
    players: room?.players ?? [],
    active: isMultiplayer,
    isHost,
    onTrack: (stream) => setRemoteStream(stream),
  });

  // 60Hz multiplayer input loop
  useGameLoop({
    emulator: isHost ? emulatorInstance : null,
    inputMapper: inputMapperRef.current,
    room,
    localUserId,
    isHost,
    sendToAll,
    setOnData,
    active: isMultiplayer,
  });

  // Leave room on unmount (safety net)
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  // Host: capture canvas stream and send to guests after game-synced
  useEffect(() => {
    if (!isHost || !isMultiplayer || !gameSynced || !emulatorInstance || streamCapturedRef.current) return;
    const canvas = emulatorInstance.getCanvas();
    if (!canvas) return;
    streamCapturedRef.current = true;
    const stream = canvas.captureStream(60);
    replaceTrackOnAll(stream);
  }, [isHost, isMultiplayer, gameSynced, emulatorInstance, replaceTrackOnAll]);

  // Track if we were previously disconnected (for reconnect countdown)
  const wasPeerDisconnectedRef = useRef(false);
  useEffect(() => {
    if (peerDisconnected) wasPeerDisconnectedRef.current = true;
  }, [peerDisconnected]);

  // On peer disconnect: host pauses emulator + saves state
  useEffect(() => {
    if (!peerDisconnected || !isMultiplayer) return;
    if (isHost && emulatorInstance) {
      emulatorInstance.pause();
      const stateData = emulatorInstance.saveState();
      if (stateData && client) {
        const binary = Array.from(stateData, (b) => String.fromCharCode(b)).join('');
        const base64 = btoa(binary);
        client.sendRoomSaveState(base64);
      }
    }
  }, [peerDisconnected, emulatorInstance, isMultiplayer, isHost, client]);

  // On peer reconnect: 3-second countdown then resume (both host and guest see countdown)
  useEffect(() => {
    if (peerDisconnected || !isMultiplayer || !wasPeerDisconnectedRef.current) return;
    wasPeerDisconnectedRef.current = false;
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          if (isHost && emulatorInstance) {
            emulatorInstance.resume();
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [peerDisconnected, isMultiplayer, isHost, emulatorInstance]);

  // On receiving reconnect state (host only): load state
  useEffect(() => {
    if (!reconnectState || !emulatorInstance || !isHost) return;
    const binary = atob(reconnectState);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    emulatorInstance.loadState(bytes);
    clearReconnectState();
  }, [reconnectState, emulatorInstance, isHost, clearReconnectState]);

  // Multiplayer sync: when emulator is running, notify server and pause until all players ready
  useEffect(() => {
    if (!emulatorInstance || !isMultiplayer || !client || sentReadyRef.current) return;
    if (emulatorInstance.getState() !== 'running') return;
    sentReadyRef.current = true;
    emulatorInstance.pause();
    setWaitingForSync(true);
    client.sendEmulatorReady();
  }, [emulatorInstance, isMultiplayer, client]);

  // Guest also sends emulator-ready immediately (no emulator to wait for)
  // Must wait for WebSocket to be connected so the message isn't silently dropped
  useEffect(() => {
    if (!isMultiplayer || isHost || !client || sentReadyRef.current || !connected) return;
    sentReadyRef.current = true;
    setWaitingForSync(true);
    client.sendEmulatorReady();
  }, [isMultiplayer, isHost, client, connected]);

  // When game-synced received: countdown then resume (host resumes emulator, guest just clears overlay)
  useEffect(() => {
    if (!gameSynced || !isMultiplayer) return;
    setWaitingForSync(false);
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          if (isHost && emulatorInstance) {
            emulatorInstance.resume();
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameSynced, isMultiplayer, isHost, emulatorInstance]);

  // Fetch game info and ROM URL
  useEffect(() => {
    if (!gameId) return;

    const fetchGame = async () => {
      try {
        const gameRes = await api.get(`/games/${gameId}`);
        const gameData = gameRes.data as Game;
        setGame(gameData);

        // Apply split-screen cheats BEFORE emulator starts (host only)
        if (isHost && gameData.splitScreenCheats && isMultiplayer && room) {
          const localPlayer = room.players.find(p => p.userId === localUserId);
          if (localPlayer) {
            const playerNum = getPlayerNumber(localPlayer.controllerPort);
            applyCheats(gameData.splitScreenCheats, playerNum);
          }
        }

        setRomUrl(`/api/games/${gameId}/rom`);

        try {
          const keymapRes = await api.get('/keymaps');
          const profiles = keymapRes.data as Array<{
            id: string;
            name: string;
            isDefault: boolean;
            mapping: Record<string, string>;
          }>;
          const active = profiles.find(p => p.isDefault) || profiles[0];
          if (active?.mapping) {
            setKeyMapping(active.mapping);
          }
        } catch {
          // Use default keymap
        }

        setLoading(false);
      } catch {
        setError('Khong the tai thong tin game');
        setLoading(false);
      }
    };

    fetchGame();
    return () => {
      removeCheats();
    };
  }, [gameId]);

  // Initialize input mapper (both host and guest need this)
  useEffect(() => {
    if (inputMapperRef.current) {
      inputMapperRef.current.updateKeyMap(keyMapping);
    } else {
      inputMapperRef.current = new InputMapper(keyMapping);
    }

    return () => {
      inputMapperRef.current?.destroy();
      inputMapperRef.current = null;
    };
  }, [keyMapping]);

  const handleEmulatorReady = useCallback(() => {
    if (isMultiplayer && client && !sentReadyRef.current && emulatorInstance) {
      sentReadyRef.current = true;
      emulatorInstance.pause();
      setWaitingForSync(true);
      client.sendEmulatorReady();
    }
  }, [isMultiplayer, client, emulatorInstance]);

  const handleEmulatorRef = useCallback((emu: EmulatorCore | null) => {
    setEmulatorInstance(emu);
  }, []);

  const handleSaveToSlot = useCallback(async (slot: number) => {
    if (!game) return;
    const label = prompt('Nhan cho save state (de trong neu khong can):');
    if (label === null) return; // User pressed Cancel
    try {
      const stateData = emulatorInstance?.saveState();
      if (!stateData) {
        alert('Emulator chua san sang');
        return;
      }
      await saveManager.save(game._id, slot, stateData, label);
      setSaveRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Save state error:', err);
      alert('Loi khi save state');
    }
  }, [game, emulatorInstance]);

  const handleLoadFromSlot = useCallback(async (slot: number) => {
    if (!game || !emulatorInstance) return;
    try {
      const data = await saveManager.load(game._id, slot);
      if (data) {
        emulatorInstance.loadState(data);
      }
    } catch (err) {
      console.error('Load state error:', err);
      alert('Loi khi load save state');
    }
  }, [game, emulatorInstance]);

  const handleKeySave = useCallback(async (newMapping: Record<string, string>) => {
    setKeyMapping(newMapping);
    setShowKeyMapper(false);
    try {
      const keymapRes = await api.get('/keymaps');
      const profiles = keymapRes.data as Array<{ id: string; isDefault: boolean }>;
      const active = profiles.find(p => p.isDefault) || profiles[0];
      if (active) {
        await api.put(`/keymaps/${active.id}`, { mapping: newMapping });
      }
    } catch {
      // Mapping still updated locally
    }
  }, []);

  if (loading) {
    return (
      <div style={{
        maxWidth: 800,
        margin: '0 auto',
        aspectRatio: '4/3',
        background: '#000',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <DinoRunner />
        </div>
        <p style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          color: '#888', fontSize: 12, margin: 0, padding: '8px 0',
          textAlign: 'center', background: 'rgba(0,0,0,0.7)',
        }}>
          Dang tai game... Game se tu dong bat dau khi san sang.
        </p>
      </div>
    );
  }

  if (error || !game || !romUrl) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: '#ff4444' }}>{error || 'Khong tim thay game'}</p>
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

  // Determine if guest should see video or emulator
  // If gameStarting is true and user is not the host, always show guest video
  // (even before room data loads, to prevent EmulatorJS from loading on guest)
  const showGuestVideo = isMultiplayer && !isHost
    || (gameStarting && room && room.hostId !== localUserId);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{game.title}</h2>
          <span style={{ color: '#666', fontSize: 13 }}>
            {game.region} | {game.genre}
            {isMultiplayer && (
              <span style={{ marginLeft: 8, color: isHost ? '#4ecdc4' : '#ffa500' }}>
                {isHost ? '(Host)' : '(Guest)'}
              </span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Save states only available for host (they have the emulator) */}
          {(!isMultiplayer || isHost) && (
            <button
              onClick={() => { setShowSaves(s => !s); setShowKeyMapper(false); }}
              style={{
                padding: '6px 14px',
                background: showSaves ? '#4a9eff' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Save States
            </button>
          )}
          <button
            onClick={() => { setShowKeyMapper(s => !s); setShowSaves(false); }}
            style={{
              padding: '6px 14px',
              background: showKeyMapper ? '#4a9eff' : '#333',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Phim tat
          </button>
          <button
            onClick={() => { leaveRoom(); navigate('/'); }}
            style={{
              padding: '6px 14px',
              background: '#aa3333',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Thoat
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {showGuestVideo ? (
            <GuestVideoPlayer stream={remoteStream} />
          ) : (
            <GameCanvas
              romUrl={romUrl}
              biosUrl="/api/games/bios/scph5501.bin"
              onReady={handleEmulatorReady}
              onEmulatorRef={handleEmulatorRef}
            />
          )}

          {isMultiplayer && waitingForSync && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)', zIndex: 60,
              flexDirection: 'column', gap: 12,
            }}>
              <div style={{ color: '#4ecdc4', fontSize: 20 }}>
                {isHost ? 'Doi nguoi choi khac tai game...' : 'Doi host tai game...'}
              </div>
              <div style={{ color: '#888', fontSize: 14 }}>
                Da san sang: {loadedPlayers.length}/{room?.players.length ?? 0} nguoi choi
              </div>
            </div>
          )}
          {isMultiplayer && peerDisconnected && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)', zIndex: 60,
              flexDirection: 'column', gap: 12,
            }}>
              <div style={{ color: '#ffa500', fontSize: 20 }}>
                Nguoi choi da mat ket noi
              </div>
              <div style={{ color: '#888', fontSize: 14 }}>
                {isHost ? 'Game da tam dung. Doi ket noi lai... (toi da 60 giay)' : 'Game da tam dung. Doi nguoi choi ket noi lai...'}
              </div>
            </div>
          )}
          {isMultiplayer && countdown !== null && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.6)', zIndex: 60,
              flexDirection: 'column', gap: 12,
            }}>
              <div style={{ color: '#4a9eff', fontSize: 48, fontWeight: 'bold' }}>
                {countdown}
              </div>
              <div style={{ color: '#ccc', fontSize: 16 }}>
                Chuan bi tiep tuc...
              </div>
            </div>
          )}
        </div>

        {showSaves && (
          <div style={{ width: 400, flexShrink: 0 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Save States</h3>
            <SaveSlotGrid
              key={saveRefreshKey}
              gameId={game._id}
              onLoad={handleLoadFromSlot}
              onSave={handleSaveToSlot}
            />
          </div>
        )}

        {showKeyMapper && (
          <div style={{ width: 350, flexShrink: 0 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Cau hinh phim</h3>
            <KeyMapper
              mapping={keyMapping}
              onSave={handleKeySave}
              onCancel={() => setShowKeyMapper(false)}
            />
          </div>
        )}
      </div>

      {isMultiplayer && <ConnectionStatus peers={peerInfos} />}
    </div>
  );
}
