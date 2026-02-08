import { create } from 'zustand';
import { SignalingClient, type SignalingRoom } from '../netplay/signaling';
import type { ChatMessage } from '../components/ChatBox';

interface RoomState {
  client: SignalingClient | null;
  connected: boolean;
  room: SignalingRoom | null;
  rooms: SignalingRoom[];
  messages: ChatMessage[];
  error: string | null;
  gameStarting: boolean;
  peerDisconnected: boolean;
  reconnectState: string | null;
  gameSynced: boolean;
  loadedPlayers: string[];

  connect: (token: string) => void;
  disconnect: () => void;
  clearRoom: () => void;
  clearError: () => void;
  clearReconnectState: () => void;
  setReadyLocal: (userId: string, ready: boolean) => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  client: null,
  connected: false,
  room: null,
  rooms: [],
  messages: [],
  error: null,
  gameStarting: false,
  peerDisconnected: false,
  reconnectState: null,
  gameSynced: false,
  loadedPlayers: [],

  connect: (token: string) => {
    const existing = get().client;
    if (existing?.connected) return;

    // Disconnect old client if exists
    existing?.disconnect();

    const client = new SignalingClient({
      onOpen: () => {
        set({ connected: true });
        // Auto-rejoin room on reconnect (both waiting and playing states)
        const state = get();
        const roomId = state.room?.id || sessionStorage.getItem('currentRoomId');
        if (roomId) {
          client.rejoinRoom(roomId);
        }
      },
      onClose: () => set({ connected: false }),
      onRoomUpdated: (r) => {
        set({ room: r });
        if (r) sessionStorage.setItem('currentRoomId', r.id);
      },
      onRoomList: (r) => set({ rooms: r }),
      onGameStarting: (r) => {
        set({ room: r, gameStarting: true });
        if (r) sessionStorage.setItem('currentRoomId', r.id);
      },
      onChat: (fromId, displayName, message, timestamp) => {
        set((s) => ({
          messages: [...s.messages, { fromId, displayName, message, timestamp }],
        }));
      },
      onPlayerDisconnected: (_userId, temporary) => {
        if (temporary) {
          set({ peerDisconnected: true });
        }
        // room-updated will follow
      },
      onPlayerReconnected: () => {
        set({ peerDisconnected: false });
      },
      onReconnectState: (stateData) => {
        set({ reconnectState: stateData });
      },
      onPlayerLoaded: (userId) => {
        set((s) => ({
          loadedPlayers: s.loadedPlayers.includes(userId) ? s.loadedPlayers : [...s.loadedPlayers, userId],
        }));
      },
      onGameSynced: () => {
        set({ gameSynced: true });
      },
      onError: (code, msg) => {
        // If rejoin failed (room gone / not in room), clear stale room state
        if (code === 'NOT_FOUND' || code === 'NOT_IN_ROOM' || code === 'ROOM_CLOSED') {
          sessionStorage.removeItem('currentRoomId');
          set({ room: null, gameStarting: false, gameSynced: false, loadedPlayers: [] });
        }
        set({ error: msg });
        setTimeout(() => set({ error: null }), 5000);
      },
    });

    client.connect(token);
    set({ client });
  },

  disconnect: () => {
    get().client?.disconnect();
    sessionStorage.removeItem('currentRoomId');
    set({
      client: null,
      connected: false,
      room: null,
      rooms: [],
      messages: [],
      error: null,
      gameStarting: false,
      peerDisconnected: false,
      reconnectState: null,
      gameSynced: false,
      loadedPlayers: [],
    });
  },

  clearRoom: () => {
    sessionStorage.removeItem('currentRoomId');
    set({ room: null, messages: [], gameStarting: false, peerDisconnected: false, reconnectState: null, gameSynced: false, loadedPlayers: [] });
  },

  clearError: () => set({ error: null }),

  clearReconnectState: () => set({ reconnectState: null }),

  setReadyLocal: (userId: string, ready: boolean) => {
    const room = get().room;
    if (!room) return;
    set({
      room: {
        ...room,
        players: room.players.map(p =>
          p.userId === userId ? { ...p, isReady: ready } : p
        ),
      },
    });
  },
}));
