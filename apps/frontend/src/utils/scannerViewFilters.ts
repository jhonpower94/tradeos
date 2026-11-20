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

export type StoredScannerViewFilters = {
  viewSide?: ViewSide;
  viewStage?: ViewStage;
  viewTimeframe?: ViewTimeframe;
  minConfidence?: number;
  maxConfidence?: number;
};

const STORAGE_KEY = 'trading-os.scannerViewFilters';

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function normalizeSide(v: unknown): ViewSide {
  return v === 'BUY' || v === 'SELL' ? v : 'ALL';
}

function normalizeStage(v: unknown): ViewStage {
  return v === 'triggered' || v === 'watching' ? v : 'ALL';
}

function normalizeTimeframe(v: unknown): ViewTimeframe {
  return typeof v === 'string' && v && v !== 'ALL' ? v : 'ALL';
}

/** Durable browser store so filters survive navigation even if settings GET omits fields. */
export function readStoredViewFilters(userId?: string | null): StoredScannerViewFilters | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScannerViewFilters;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredViewFilters(
  patch: StoredScannerViewFilters,
  userId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    const prev = readStoredViewFilters(userId) ?? {};
    const next = { ...prev, ...patch };
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

function storageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY;
}

/** Read Scanner/Signals view filters from account scanner settings. */
export function scannerViewFiltersFromSettings(
  scanner: Partial<ScannerSettings> | null | undefined,
): ScannerViewFilters {
  return buildViewFilters(scanner, null);
}

/**
 * Merge server settings with localStorage.
 * localStorage wins for view* / confidence when present so navigation cannot reset to ALL.
 */
export function resolveScannerViewFilters(
  scanner: Partial<ScannerSettings> | null | undefined,
  stored: StoredScannerViewFilters | null | undefined,
): ScannerViewFilters {
  return buildViewFilters(scanner, stored);
}

function buildViewFilters(
  scanner: Partial<ScannerSettings> | null | undefined,
  stored: StoredScannerViewFilters | null | undefined,
): ScannerViewFilters {
  const viewSide = normalizeSide(stored?.viewSide ?? scanner?.viewSide);
  const viewStage = normalizeStage(stored?.viewStage ?? scanner?.viewStage);
  const viewTimeframe = normalizeTimeframe(stored?.viewTimeframe ?? scanner?.viewTimeframe);
  const minConfidence = clampConfidence(
    Number(stored?.minConfidence ?? scanner?.minConfidence ?? 75),
  );
  const maxConfidence = clampConfidence(
    Number(stored?.maxConfidence ?? scanner?.maxConfidence ?? 100),
  );
  return {
    minConfidence,
    maxConfidence,
    preferMidConfidence: scanner?.preferMidConfidence !== false,
    viewSide,
    viewStage,
    viewTimeframe,
    side: viewSide === 'BUY' || viewSide === 'SELL' ? viewSide : undefined,
    stage: viewStage === 'triggered' || viewStage === 'watching' ? viewStage : undefined,
    timeframe: viewTimeframe !== 'ALL' ? String(viewTimeframe) : undefined,
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
