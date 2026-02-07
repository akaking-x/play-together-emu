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

  connect: (token: string) => void;
  disconnect: () => void;
  clearRoom: () => void;
  clearError: () => void;
  clearReconnectState: () => void;
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

  connect: (token: string) => {
    const existing = get().client;
    if (existing?.connected) return;

    // Disconnect old client if exists
    existing?.disconnect();

    const client = new SignalingClient({
      onOpen: () => {
        set({ connected: true });
        // Auto-rejoin room if was in a game
        const state = get();
        if (state.gameStarting && state.room) {
          client.rejoinRoom(state.room.id);
        }
      },
      onClose: () => set({ connected: false }),
      onRoomUpdated: (r) => set({ room: r }),
      onRoomList: (r) => set({ rooms: r }),
      onGameStarting: (r) => set({ room: r, gameStarting: true }),
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
      onError: (_code, msg) => {
        set({ error: msg });
        setTimeout(() => set({ error: null }), 5000);
      },
    });

    client.connect(token);
    set({ client });
  },

  disconnect: () => {
    get().client?.disconnect();
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
    });
  },

  clearRoom: () => set({ room: null, messages: [], gameStarting: false, peerDisconnected: false, reconnectState: null }),

  clearError: () => set({ error: null }),

  clearReconnectState: () => set({ reconnectState: null }),
}));
