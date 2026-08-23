import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  email: string;
  role?: 'user' | 'admin';
  totpEnabled?: boolean;
  subscription?: {
    active: boolean;
    endsAt: string | null;
    planId: string | null;
  } | null;
};

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser, refreshToken?: string | null) => void;
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
          refreshToken:
            refreshToken !== undefined && refreshToken !== null ? refreshToken : s.refreshToken,
        })),
      logout: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'trading-os-auth' },
  ),
);
