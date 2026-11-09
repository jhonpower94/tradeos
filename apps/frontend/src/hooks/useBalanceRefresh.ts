import { useCallback, useRef, useState, type TouchEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** Invalidate portfolio / positions / margin wallets so Balances sync with Binance. */
export function invalidateBalanceQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['portfolio'] });
  void qc.invalidateQueries({ queryKey: ['positions'] });
  void qc.invalidateQueries({ queryKey: ['margin-wallets'] });
  void qc.invalidateQueries({ queryKey: ['positions-context'] });
}

export function useBalanceRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refreshBalances = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['portfolio'] }),
        qc.invalidateQueries({ queryKey: ['positions'] }),
        qc.invalidateQueries({ queryKey: ['margin-wallets'] }),
        qc.invalidateQueries({ queryKey: ['positions-context'] }),
      ]);
      await Promise.all([
        qc.refetchQueries({ queryKey: ['portfolio'] }),
        qc.refetchQueries({ queryKey: ['positions'] }),
        qc.refetchQueries({ queryKey: ['margin-wallets'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  return { refreshing, refreshBalances };
}

/** Lightweight touch pull-to-refresh at the top of a scrollable page. */
export function usePullToRefresh(onRefresh: () => void | Promise<void>, enabled = true) {
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const [pullPx, setPullPx] = useState(0);
  const [busy, setBusy] = useState(false);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || busy) return;
      if (window.scrollY > 4) return;
      startY.current = e.touches[0]?.clientY ?? null;
      pulling.current = true;
    },
    [enabled, busy],
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling.current || startY.current == null || busy) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy > 0 && window.scrollY <= 4) {
        setPullPx(Math.min(72, dy * 0.45));
      } else {
        setPullPx(0);
      }
    },
    [busy],
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    const shouldRefresh = pullPx >= 48;
    setPullPx(0);
    startY.current = null;
    if (!shouldRefresh || busy) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }, [pullPx, onRefresh, busy]);

  return {
    pullPx,
    pullBusy: busy,
    pullHandlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}

export function formatBalanceAsOf(dataUpdatedAt?: number): string {
  if (!dataUpdatedAt) return '—';
  return new Date(dataUpdatedAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
