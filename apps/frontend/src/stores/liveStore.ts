import { create } from 'zustand';

export type CandlePatch = {
  symbol: string;
  interval: string;
  candle: {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
  };
  isClosed: boolean;
  ts: number;
};

interface LiveState {
  opportunities: unknown[];
  positions: unknown[];
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  candlePatches: Record<string, CandlePatch>;
  setOpportunities: (items: unknown[]) => void;
  setPositions: (items: unknown[]) => void;
  setConnectionStatus: (s: LiveState['connectionStatus']) => void;
  applyCandlePatch: (key: string, patch: CandlePatch) => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  opportunities: [],
  positions: [],
  connectionStatus: 'disconnected',
  candlePatches: {},
  setOpportunities: (items) => set({ opportunities: items }),
  setPositions: (items) => set({ positions: items }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  applyCandlePatch: (key, patch) =>
    set((state) => ({
      candlePatches: { ...state.candlePatches, [key]: patch },
    })),
}));
