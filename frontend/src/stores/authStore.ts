import { create } from 'zustand';
import { api } from '../api/client';
import { useRoomStore } from './roomStore';

export interface TokenPayload {
  id: string;
  username: string;
  role: string;
  displayName: string;
}

interface AuthState {
  user: TokenPayload | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/auth/login', { username, password });
      const { token, user } = res.data as { token: string; user: TokenPayload };
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ token, user, loading: false });
      return true;
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'Login failed';
      set({ loading: false, error: message });
      return false;
    }
  },

  logout: () => {
    useRoomStore.getState().disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
    window.location.href = '/login';
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as TokenPayload;
        set({ token, user });
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  },
}));
