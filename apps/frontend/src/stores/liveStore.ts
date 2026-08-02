import { create } from 'zustand';

interface LiveState {
  opportunities: unknown[];
  positions: unknown[];
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  setOpportunities: (items: unknown[]) => void;
  setPositions: (items: unknown[]) => void;
  setConnectionStatus: (s: LiveState['connectionStatus']) => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  opportunities: [],
  positions: [],
  connectionStatus: 'disconnected',
  setOpportunities: (items) => set({ opportunities: items }),
  setPositions: (items) => set({ positions: items }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
