import { create } from 'zustand';
import { api } from '../api/client';
import type { SplitScreenCheats } from '../types/split-screen';

export interface Game {
  _id: string;
  title: string;
  slug: string;
  discId: string;
  region: string;
  genre: string;
  romFilename: string;
  romSizeBytes: number;
  minPlayers: number;
  maxPlayers: number;
  hasSplitScreen: boolean;
  splitScreenCheats: SplitScreenCheats | null;
  coverPath: string;
  description: string;
  isActive: boolean;
}

export interface Room {
  id: string;
  hostId: string;
  gameId: string;
  roomName: string;
  maxPlayers: number;
  isPrivate: boolean;
  players: Array<{
    userId: string;
    displayName: string;
    controllerPort: number;
    isReady: boolean;
  }>;
  status: 'waiting' | 'playing' | 'closed';
}

interface GameState {
  games: Game[];
  currentGame: Game | null;
  rooms: Room[];
  loading: boolean;
  fetchGames: () => Promise<void>;
  fetchRooms: (gameId: string) => Promise<void>;
  setCurrentGame: (game: Game | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  games: [],
  currentGame: null,
  rooms: [],
  loading: false,

  fetchGames: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/games');
      set({ games: res.data as Game[], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchRooms: async (gameId: string) => {
    try {
      const res = await api.get(`/rooms?gameId=${gameId}`);
      set({ rooms: res.data as Room[] });
    } catch {
      // ignore
    }
  },

  setCurrentGame: (game: Game | null) => set({ currentGame: game }),
}));
