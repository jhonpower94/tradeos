import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewSide = 'ALL' | 'BUY' | 'SELL';
export type ViewStage = 'ALL' | 'triggered' | 'watching';
export type ViewTimeframe = 'ALL' | string;

type ScannerViewState = {
  viewSide: ViewSide;
  viewStage: ViewStage;
  viewTimeframe: ViewTimeframe;
  /** null = use account Settings min/max */
  minConfidence: number | null;
  maxConfidence: number | null;
  setView: (patch: {
    viewSide?: ViewSide;
    viewStage?: ViewStage;
    viewTimeframe?: ViewTimeframe;
    minConfidence?: number | null;
    maxConfidence?: number | null;
  }) => void;
};

/**
 * SPA-durable view filters. Survives route changes in memory and refresh via localStorage.
 * Not derived from settings GET (that path kept resetting Side back to ALL).
 */
export const useScannerViewStore = create<ScannerViewState>()(
  persist(
    (set) => ({
      viewSide: 'ALL',
      viewStage: 'ALL',
      viewTimeframe: 'ALL',
      minConfidence: null,
      maxConfidence: null,
      setView: (patch) => set((s) => ({ ...s, ...patch })),
    }),
    { name: 'trading-os-scanner-view' },
  ),
);
