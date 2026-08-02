import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: { id: string; email: string } | null;
  setAuth: (
    token: string,
    user: { id: string; email: string },
    refreshToken?: string | null,
  ) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (token, user, refreshToken = null) =>
        set((s) => ({
          token,
          user,
          refreshToken: refreshToken !== undefined && refreshToken !== null ? refreshToken : s.refreshToken,
        })),
      logout: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'trading-os-auth' },
  ),
);
