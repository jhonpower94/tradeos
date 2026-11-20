import type { ScannerSettings } from '@trading-os/shared';

export type ViewSide = 'ALL' | 'BUY' | 'SELL';
export type ViewStage = 'ALL' | 'triggered' | 'watching';
export type ViewTimeframe = 'ALL' | string;

export type ScannerViewFilters = {
  minConfidence: number;
  maxConfidence: number;
  preferMidConfidence: boolean;
  viewSide: ViewSide;
  viewStage: ViewStage;
  viewTimeframe: ViewTimeframe;
  /** API/list values — undefined means no filter (ALL). */
  side?: 'BUY' | 'SELL';
  stage?: 'triggered' | 'watching';
  timeframe?: string;
};

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Read Scanner/Signals view filters from account scanner settings. */
export function scannerViewFiltersFromSettings(
  scanner: Partial<ScannerSettings> | null | undefined,
): ScannerViewFilters {
  const viewSide = (scanner?.viewSide ?? 'ALL') as ViewSide;
  const viewStage = (scanner?.viewStage ?? 'ALL') as ViewStage;
  const viewTimeframe = (scanner?.viewTimeframe ?? 'ALL') as ViewTimeframe;
  const minConfidence = clampConfidence(Number(scanner?.minConfidence ?? 75));
  const maxConfidence = clampConfidence(Number(scanner?.maxConfidence ?? 100));
  return {
    minConfidence,
    maxConfidence,
    preferMidConfidence: scanner?.preferMidConfidence !== false,
    viewSide: viewSide === 'BUY' || viewSide === 'SELL' ? viewSide : 'ALL',
    viewStage:
      viewStage === 'triggered' || viewStage === 'watching' ? viewStage : 'ALL',
    viewTimeframe: viewTimeframe && viewTimeframe !== 'ALL' ? viewTimeframe : 'ALL',
    side: viewSide === 'BUY' || viewSide === 'SELL' ? viewSide : undefined,
    stage:
      viewStage === 'triggered' || viewStage === 'watching' ? viewStage : undefined,
    timeframe: viewTimeframe && viewTimeframe !== 'ALL' ? String(viewTimeframe) : undefined,
  };
}

/** Client-side row match for live WS / unfiltered lists. */
export function matchesScannerViewFilters(
  row: Record<string, unknown>,
  filters: ScannerViewFilters,
  opts?: { isWatching: (o: Record<string, unknown>) => boolean },
): boolean {
  const isWatching = opts?.isWatching ?? ((o) => o.stage === 'watching' || o.status === 'watching');
  const conf = Number(row.confidence);
  const watching = isWatching(row);
  if (Number.isFinite(conf) && !watching && conf < filters.minConfidence) return false;
  if (Number.isFinite(conf) && !watching && conf > filters.maxConfidence) return false;
  if (filters.timeframe && row.timeframe !== filters.timeframe) return false;
  if (filters.side && row.side !== filters.side) return false;
  if (filters.stage === 'triggered' && watching) return false;
  if (filters.stage === 'watching' && !watching) return false;
  return true;
}
