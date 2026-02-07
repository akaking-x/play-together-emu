import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GameCanvas } from '../components/GameCanvas';
import { SaveSlotGrid } from '../components/SaveSlotGrid';
import { KeyMapper } from '../components/KeyMapper';
import { ConnectionStatus } from '../components/ConnectionStatus';
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
  const [keyMapping, setKeyMapping] = useState<Record<string, string>>(DEFAULT_KEYMAP);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputMapperRef = useRef<InputMapper | null>(null);
  const [emulatorInstance, setEmulatorInstance] = useState<EmulatorCore | null>(null);

  // Multiplayer state from stores
  const { room, client, gameStarting } = useRoomStore();
  const { leaveRoom } = useRoom();
  const user = useAuthStore((s) => s.user);
  const localUserId = user?.id ?? '';

  const isMultiplayer = !!(room && room.players.length > 1 && gameStarting);

  // Bridge client to a RefObject for useNetplay
  const clientRef = useRef(client);
  clientRef.current = client;

  // WebRTC peer connections
  const { peerInfos, sendToAll, setOnData } = useNetplay({
    signalingClient: clientRef,
    localUserId,
    players: room?.players ?? [],
    active: isMultiplayer,
  });

  // 60Hz multiplayer input sync loop
  useGameLoop({
    emulator: emulatorInstance,
    inputMapper: inputMapperRef.current,
    room,
    localUserId,
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

  // Fetch game info and ROM URL
  useEffect(() => {
    if (!gameId) return;

    const fetchGame = async () => {
      try {
        const gameRes = await api.get(`/games/${gameId}`);
        const gameData = gameRes.data as Game;
        setGame(gameData);

        // Apply split-screen cheats BEFORE emulator starts
        if (gameData.splitScreenCheats && isMultiplayer && room) {
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

  // Initialize input mapper
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
    // Emulator is loaded and running
  }, []);

  const handleEmulatorRef = useCallback((emu: EmulatorCore | null) => {
    setEmulatorInstance(emu);
  }, []);

  const handleSaveToSlot = useCallback(async (slot: number) => {
    if (!game) return;
    const label = prompt('Nhan cho save state (de trong neu khong can):') ?? '';
    try {
      const stateData = emulatorInstance?.saveState();
      if (!stateData) {
        alert('Emulator chua san sang');
        return;
      }
      await saveManager.save(game._id, slot, stateData, label);
    } catch {
      alert('Loi khi save state');
    }
  }, [game, emulatorInstance]);

  const handleLoadFromSlot = useCallback(async (slot: number) => {
    if (!game) return;
    try {
      const data = await saveManager.load(game._id, slot);
      if (data && emulatorInstance) {
        emulatorInstance.loadState(data);
      }
    } catch {
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
      <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
        Dang tai game...
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{game.title}</h2>
          <span style={{ color: '#666', fontSize: 13 }}>{game.region} | {game.genre}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <GameCanvas
            romUrl={romUrl}
            biosUrl="/api/games/bios/scph5501.bin"
            onReady={handleEmulatorReady}
            onEmulatorRef={handleEmulatorRef}
          />
        </div>

        {showSaves && (
          <div style={{ width: 400, flexShrink: 0 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Save States</h3>
            <SaveSlotGrid
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
