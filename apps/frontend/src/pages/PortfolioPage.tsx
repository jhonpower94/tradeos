import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import IconButton from '@mui/joy/IconButton';
import Input from '@mui/joy/Input';
import Typography from '@mui/joy/Typography';
import Close from '@mui/icons-material/Close';
import Refresh from '@mui/icons-material/Refresh';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { portfolioApi, positionsApi, settingsApi, tradesApi } from '../api';
import { RegimeChip } from '../components/RegimeChip';
import { BiasChip } from '../components/BiasChip';
import { CandleChart } from '../components/CandleChart';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { SideChip } from '../components/SideChip';
import { PnlText } from '../components/PnlText';
import { KeyValueList, ResponsiveRecordList } from '../components/ResponsiveRecordList';
import {
  formatBalanceAsOf,
  useBalanceRefresh,
  usePullToRefresh,
} from '../hooks/useBalanceRefresh';
import { formatNumber, formatPrice } from '../utils/format';
import { monoSx } from '../theme/theme';

function errMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

type PositionContext = {
  positionId: string;
  tradeId: string;
  timeframe: string;
  regime: string;
  htfTrend: string | null;
  htfTimeframe: string | null;
  aligned: boolean;
  suggestion: string;
  message: string;
};

type CopyResult = {
  mode?: 'clone' | 'rescan';
  symbol?: string;
  count?: number;
  opportunity?: { stopLoss?: number; takeProfit?: number; primaryStrategy?: string };
};

type MarginWalletRow = {
  symbol: string;
  marginLevel: number;
  hasDebt: boolean;
  maxTransferableUsdt: number;
  sweepableUsdt: number;
  status: 'clear' | 'debt' | 'ready_to_sweep';
  base: { asset: string; borrowed: number; interest: number; free: number };
  quote: { asset: string; borrowed: number; interest: number; free: number; locked: number };
};

export function PortfolioPage() {
  const qc = useQueryClient();
  const { refreshing, refreshBalances } = useBalanceRefresh();
  const {
    data: summary,
    dataUpdatedAt: portfolioUpdatedAt,
    isFetching: portfolioFetching,
  } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.summary,
    refetchInterval: 5_000,
  });
  const { data: positions } = useQuery({
    queryKey: ['positions'],
    queryFn: positionsApi.list,
    refetchInterval: 5_000,
  });
  const { data: contexts } = useQuery({
    queryKey: ['positions-context'],
    queryFn: positionsApi.context,
    refetchInterval: 30_000,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });
  const { data: tradesData } = useQuery({
    queryKey: ['trades'],
    queryFn: tradesApi.list,
    refetchInterval: 10_000,
  });
  const contextByPosition = new Map<string, PositionContext>(
    ((contexts?.items ?? []) as PositionContext[]).map((c) => [c.positionId, c]),
  );

  const [chartPositionId, setChartPositionId] = useState<string | null>(null);
  const [editPositionId, setEditPositionId] = useState<string | null>(null);
  const [editSl, setEditSl] = useState('');
  const [editTp, setEditTp] = useState('');
  const [copyInfo, setCopyInfo] = useState<string | null>(null);

  const isPaper = (summary?.mode ?? settings?.trading?.mode ?? 'paper') === 'paper';
  const isLiveMargin =
    summary?.mode === 'live' &&
    (summary as { executionVenue?: string }).executionVenue === 'margin';

  const { data: marginWallets } = useQuery({
    queryKey: ['margin-wallets'],
    queryFn: portfolioApi.marginWallets,
    enabled: isLiveMargin,
    refetchInterval: 5_000,
  });

  const [marginActionError, setMarginActionError] = useState<string | null>(null);
  const { pullPx, pullBusy, pullHandlers } = usePullToRefresh(refreshBalances);

  const marginRepay = useMutation({
    mutationFn: (symbol: string) => portfolioApi.marginRepay(symbol),
    onSuccess: () => {
      setMarginActionError(null);
      void qc.invalidateQueries({ queryKey: ['margin-wallets'] });
      void qc.invalidateQueries({ queryKey: ['portfolio'] });
      void qc.invalidateQueries({ queryKey: ['positions'] });
    },
    onError: (err) => setMarginActionError(errMsg(err)),
  });
  const marginTransfer = useMutation({
    mutationFn: (symbol: string) => portfolioApi.marginTransfer(symbol),
    onSuccess: () => {
      setMarginActionError(null);
      void qc.invalidateQueries({ queryKey: ['margin-wallets'] });
      void qc.invalidateQueries({ queryKey: ['portfolio'] });
      void qc.invalidateQueries({ queryKey: ['positions'] });
    },
    onError: (err) => setMarginActionError(errMsg(err)),
  });
  const marginSettle = useMutation({
    mutationFn: (symbol: string) => portfolioApi.marginSettle(symbol),
    onSuccess: () => {
      setMarginActionError(null);
      void qc.invalidateQueries({ queryKey: ['margin-wallets'] });
      void qc.invalidateQueries({ queryKey: ['portfolio'] });
      void qc.invalidateQueries({ queryKey: ['positions'] });
      void qc.invalidateQueries({ queryKey: ['trades'] });
    },
    onError: (err) => setMarginActionError(errMsg(err)),
  });

  const marginPending =
    marginRepay.isPending || marginTransfer.isPending || marginSettle.isPending;

  const settleAllMargin = async () => {
    const items = (marginWallets?.items ?? []) as MarginWalletRow[];
    const targets = items.filter(
      (w) => w.hasDebt || w.status === 'ready_to_sweep' || w.sweepableUsdt > 0.01,
    );
    if (!targets.length) return;
    if (
      !window.confirm(
        `Settle ${targets.length} isolated pair(s)? Repays borrow then moves USDT to Spot.`,
      )
    ) {
      return;
    }
    setMarginActionError(null);
    const errors: string[] = [];
    for (const w of targets) {
      try {
        await portfolioApi.marginSettle(w.symbol);
      } catch (e) {
        errors.push(`${w.symbol}: ${errMsg(e)}`);
      }
    }
    void qc.invalidateQueries({ queryKey: ['margin-wallets'] });
    void qc.invalidateQueries({ queryKey: ['portfolio'] });
    void qc.invalidateQueries({ queryKey: ['positions'] });
    void qc.invalidateQueries({ queryKey: ['trades'] });
    if (errors.length) setMarginActionError(errors.join(' · '));
  };

  const invalidateTradeQueries = () => {
    qc.invalidateQueries({ queryKey: ['positions'] });
    qc.invalidateQueries({ queryKey: ['positions-context'] });
    qc.invalidateQueries({ queryKey: ['trades'] });
    qc.invalidateQueries({ queryKey: ['portfolio'] });
    qc.invalidateQueries({ queryKey: ['margin-wallets'] });
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['signals'] });
  };

  const [lastCloseTradeId, setLastCloseTradeId] = useState<string | null>(null);
  const closeTrade = useMutation({
    mutationFn: ({ tradeId, affordable }: { tradeId: string; affordable?: boolean }) =>
      tradesApi.close(tradeId, affordable ? { affordable: true } : undefined),
    onSuccess: () => {
      setLastCloseTradeId(null);
      invalidateTradeQueries();
      // Post-close symbol rescan is fire-and-forget; refresh again after it can persist.
      window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['signals'] });
        void qc.invalidateQueries({ queryKey: ['opportunities'] });
      }, 2_000);
    },
  });

  const copyTrade = useMutation({
    mutationFn: (tradeId: string) => tradesApi.copy(tradeId),
    onSuccess: (data: CopyResult) => {
      invalidateTradeQueries();
      if (data.mode === 'rescan') {
        const n = data.count ?? 0;
        setCopyInfo(
          n > 0
            ? `Rescanned ${data.symbol ?? ''} · ${n} signal${n === 1 ? '' : 's'}`
            : `Rescanned ${data.symbol ?? ''} · no fresh signal`,
        );
        return;
      }
      const o = data.opportunity;
      setCopyInfo(
        o
          ? `Cloned · SL ${o.stopLoss != null ? formatPrice(o.stopLoss) : '—'} · TP ${o.takeProfit != null ? formatPrice(o.takeProfit) : '—'}`
          : 'Trade cloned',
      );
    },
  });

  const flipTrade = useMutation({
    mutationFn: (tradeId: string) => tradesApi.flip(tradeId),
    onSuccess: (data: {
      opportunity?: { side?: string; entry?: number };
      opened?: { side?: string; entryPrice?: number };
    }) => {
      invalidateTradeQueries();
      setCopyInfo(
        `Flipped to ${data?.opportunity?.side ?? data?.opened?.side ?? 'opposite'} @ ${
          data?.opportunity?.entry ?? data?.opened?.entryPrice ?? '—'
        }`,
      );
    },
  });

  const updateLevels = useMutation({
    mutationFn: (input: { id: string; stopLoss?: number; takeProfit?: number }) =>
      positionsApi.update(input.id, { stopLoss: input.stopLoss, takeProfit: input.takeProfit }),
    onSuccess: () => {
      setEditPositionId(null);
      invalidateTradeQueries();
    },
  });

  const openPositions = ((positions?.items ?? []) as Array<Record<string, unknown>>).filter(
    (p) => p.status === 'open',
  );
  const recentWinners = ((tradesData?.items ?? []) as Array<Record<string, unknown>>)
    .filter((t) => t.status === 'closed' && Number(t.realizedPnl ?? 0) > 0)
    .sort(
      (a, b) =>
        new Date(String(b.closedAt ?? b.updatedAt ?? 0)).getTime() -
        new Date(String(a.closedAt ?? a.updatedAt ?? 0)).getTime(),
    )
    .slice(0, 10);
  const uPnl = Number(summary?.unrealizedPnl ?? 0);
  const rPnl = Number(summary?.realizedPnl ?? 0);

  const actionError =
    (closeTrade.isError && errMsg(closeTrade.error)) ||
    (copyTrade.isError && errMsg(copyTrade.error)) ||
    (flipTrade.isError && errMsg(flipTrade.error)) ||
    (updateLevels.isError && errMsg(updateLevels.error)) ||
    null;

  const clearActionError = () => {
    closeTrade.reset();
    copyTrade.reset();
    flipTrade.reset();
    updateLevels.reset();
  };

  const startEdit = (p: Record<string, unknown>) => {
    const id = String(p._id);
    setChartPositionId(null);
    setEditPositionId(id);
    setEditSl(p.stopLoss != null ? String(p.stopLoss) : '');
    setEditTp(p.takeProfit != null ? String(p.takeProfit) : '');
  };

  const saveEdit = () => {
    if (!editPositionId) return;
    const stopLoss = Number(editSl);
    const takeProfit = Number(editTp);
    const body: { id: string; stopLoss?: number; takeProfit?: number } = { id: editPositionId };
    if (Number.isFinite(stopLoss) && stopLoss > 0) body.stopLoss = stopLoss;
    if (Number.isFinite(takeProfit) && takeProfit > 0) body.takeProfit = takeProfit;
    if (body.stopLoss == null && body.takeProfit == null) return;
    updateLevels.mutate(body);
  };

  const renderActions = (p: Record<string, unknown>) => {
    const id = String(p._id);
    const chartOpen = chartPositionId === id;
    const editing = editPositionId === id;
    return (
      <>
        <Button
          size="sm"
          variant={chartOpen ? 'solid' : 'outlined'}
          color="neutral"
          onClick={() => {
            setEditPositionId(null);
            setChartPositionId(chartOpen ? null : id);
          }}
        >
          Chart
        </Button>
        <Button
          size="sm"
          variant={editing ? 'solid' : 'outlined'}
          color="neutral"
          onClick={() => (editing ? setEditPositionId(null) : startEdit(p))}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          disabled={copyTrade.isPending}
          onClick={() => {
            setCopyInfo(null);
            copyTrade.mutate(String(p.tradeId));
          }}
        >
          Copy
        </Button>
        <Button
          size="sm"
          variant="outlined"
          color="warning"
          disabled={flipTrade.isPending}
          onClick={() => {
            if (
              !window.confirm(
                'Fully close this position and open the opposite side at market (size auto-calculated)?',
              )
            ) {
              return;
            }
            setCopyInfo(null);
            flipTrade.mutate(String(p.tradeId));
          }}
        >
          Flip
        </Button>
        <Button
          size="sm"
          color="warning"
          variant="outlined"
          disabled={closeTrade.isPending}
          onClick={() => {
            setLastCloseTradeId(String(p.tradeId));
            closeTrade.mutate({ tradeId: String(p.tradeId) });
          }}
        >
          Close
        </Button>
      </>
    );
  };

  const balancesRefreshing = refreshing || pullBusy || portfolioFetching;

  return (
    <Box {...pullHandlers}>
      {(pullPx > 0 || pullBusy) && (
        <Typography
          level="body-xs"
          sx={{
            textAlign: 'center',
            color: 'text.tertiary',
            height: Math.max(pullPx, pullBusy ? 28 : 0),
            mb: 0.5,
            transition: pullBusy ? 'none' : 'height 0.1s',
          }}
        >
          {pullBusy || refreshing ? 'Updating balances…' : 'Release to refresh'}
        </Typography>
      )}
      <PageHeader
        title="Portfolio"
        subtitle="Balances and open spots"
        actions={
          <Button
            size="sm"
            variant="outlined"
            color="neutral"
            loading={balancesRefreshing}
            startDecorator={<Refresh />}
            onClick={() => void refreshBalances()}
          >
            Refresh
          </Button>
        }
      />
      {(summary as { executionVenue?: string; marginLevel?: number } | undefined)?.executionVenue ===
        'margin' && (
        <Typography level="body-sm" sx={{ mb: 2, color: 'text.tertiary' }}>
          Live isolated margin: borrowed assets accrue interest. Margin level{' '}
          {(summary as { marginLevel?: number }).marginLevel != null
            ? Number((summary as { marginLevel?: number }).marginLevel).toFixed(2)
            : '—'}
          .
        </Typography>
      )}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' },
          mb: 3.5,
        }}
      >
        <StatCard label="Equity" value={formatNumber(summary?.equity ?? 0)} />
        <StatCard
          label={
            summary?.mode === 'live' && summary?.executionVenue === 'margin'
              ? 'Risk budget (slots)'
              : summary?.mode === 'live'
                ? 'Risk budget'
                : 'Free USDT'
          }
          value={formatNumber(summary?.freeQuote ?? 0)}
        />
        <StatCard
          label="Unrealized PnL"
          value={formatNumber(uPnl)}
          tone={uPnl > 0 ? 'positive' : uPnl < 0 ? 'negative' : 'neutral'}
        />
        <StatCard
          label="Realized PnL"
          value={formatNumber(rPnl)}
          tone={rPnl > 0 ? 'positive' : rPnl < 0 ? 'negative' : 'neutral'}
        />
        <StatCard label="Mode" value={summary?.mode ?? 'paper'} />
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1,
          mb: 0.5,
        }}
      >
        <Typography level="title-md">Balances</Typography>
        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
          {balancesRefreshing
            ? 'Updating…'
            : `Balances as of ${formatBalanceAsOf(portfolioUpdatedAt)}`}
        </Typography>
      </Box>
      {summary?.mode === 'live' && summary?.executionVenue === 'margin' && (
        <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1.5 }}>
          <strong>Risk budget</strong> is USDT stack (Spot + Isolated net) minus deployed notional on
          open positions — same slot-splitting logic as paper. Raw exchange balances per wallet are
          below; trailing column is free + locked per row. Pull down or tap Refresh to sync with
          Binance.
        </Typography>
      )}
      <Box sx={{ mb: 4 }}>
        <KeyValueList
          emptyTitle="No balances"
          items={(summary?.balances ?? []).map((b: { asset: string; free: number; locked: number }) => ({
            key: b.asset,
            primary: b.asset,
            secondary: `Free ${formatNumber(b.free)} · Locked ${formatNumber(b.locked)}`,
            trailing: (
              <Typography sx={monoSx} level="body-sm">
                {formatNumber(b.free + b.locked)}
              </Typography>
            ),
          }))}
        />
      </Box>

      {isLiveMargin && (
        <Box sx={{ mb: 4 }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mb: 1,
            }}
          >
            <Box>
              <Typography level="title-md">Isolated margin wallets</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                Closing a trade does not move USDT to Spot. Repay clears borrow; Settle repays then
                sweeps USDT to Spot (may move USDT Spot → isolated first if needed).
              </Typography>
            </Box>
            <Button
              size="sm"
              variant="soft"
              disabled={marginPending}
              onClick={() => void settleAllMargin()}
            >
              Settle all
            </Button>
          </Box>
          {marginActionError && (
            <Alert color="danger" variant="soft" sx={{ mb: 1.5 }}>
              {marginActionError}
            </Alert>
          )}
          <ResponsiveRecordList<MarginWalletRow>
            emptyTitle="No isolated wallets"
            rows={(marginWallets?.items ?? []) as MarginWalletRow[]}
            getRowKey={(w) => w.symbol}
            cardTitle={(w) => (
              <Typography level="title-md" sx={monoSx}>
                {w.symbol}
              </Typography>
            )}
            cardMeta={(w) => (
              <Chip
                size="sm"
                variant="soft"
                color={
                  w.status === 'debt'
                    ? 'danger'
                    : w.status === 'ready_to_sweep'
                      ? 'success'
                      : 'neutral'
                }
              >
                {w.status === 'debt'
                  ? 'Debt'
                  : w.status === 'ready_to_sweep'
                    ? 'Ready to sweep'
                    : 'Clear'}
              </Chip>
            )}
            cardFields={[
              {
                label: 'ML',
                render: (w) => (
                  <Typography
                    sx={monoSx}
                    color={w.marginLevel > 0 && w.marginLevel <= 2.1 ? 'warning' : undefined}
                  >
                    {w.marginLevel > 0 ? w.marginLevel.toFixed(2) : '—'}
                  </Typography>
                ),
              },
              {
                label: 'Borrowed',
                render: (w) => (
                  <Typography level="body-sm">
                    {w.base.borrowed + w.base.interest > 0
                      ? `${w.base.asset} ${formatNumber(w.base.borrowed + w.base.interest)}`
                      : '—'}
                    {w.quote.borrowed + w.quote.interest > 0.01
                      ? ` · ${w.quote.asset} ${formatNumber(w.quote.borrowed + w.quote.interest)}`
                      : ''}
                  </Typography>
                ),
              },
              {
                label: 'USDT (iso)',
                render: (w) => (
                  <Typography sx={monoSx} level="body-sm">
                    {formatNumber(w.quote.free)} free
                  </Typography>
                ),
              },
              {
                label: 'Max → Spot',
                render: (w) => (
                  <Typography sx={monoSx} level="body-sm">
                    {formatNumber(w.maxTransferableUsdt)}
                  </Typography>
                ),
              },
            ]}
            cardActions={(w) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={marginPending || !w.hasDebt}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Repay borrow for ${w.symbol}? May transfer USDT from Spot to this isolated wallet.`,
                      )
                    ) {
                      return;
                    }
                    marginRepay.mutate(w.symbol);
                  }}
                >
                  Repay
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  color="primary"
                  disabled={marginPending || w.hasDebt || w.maxTransferableUsdt <= 0.01}
                  onClick={() => {
                    if (!window.confirm(`Transfer max USDT from ${w.symbol} isolated to Spot?`)) {
                      return;
                    }
                    marginTransfer.mutate(w.symbol);
                  }}
                >
                  Transfer
                </Button>
                <Button
                  size="sm"
                  color="success"
                  disabled={marginPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Settle ${w.symbol}? Repay any borrow, then sweep USDT to Spot.`,
                      )
                    ) {
                      return;
                    }
                    marginSettle.mutate(w.symbol);
                  }}
                >
                  Settle
                </Button>
              </Box>
            )}
            columns={[
              {
                key: 'symbol',
                header: 'Pair',
                render: (w) => <Typography sx={monoSx}>{w.symbol}</Typography>,
              },
              {
                key: 'ml',
                header: 'ML',
                numeric: true,
                render: (w) => (
                  <Typography
                    sx={monoSx}
                    color={w.marginLevel > 0 && w.marginLevel <= 2.1 ? 'warning' : undefined}
                  >
                    {w.marginLevel > 0 ? w.marginLevel.toFixed(2) : '—'}
                  </Typography>
                ),
              },
              {
                key: 'debt',
                header: 'Borrowed',
                render: (w) => (
                  <Typography level="body-sm">
                    {w.base.borrowed + w.base.interest > 0
                      ? `${w.base.asset} ${formatNumber(w.base.borrowed + w.base.interest)}`
                      : '—'}
                    {w.quote.borrowed + w.quote.interest > 0.01
                      ? ` · ${w.quote.asset} ${formatNumber(w.quote.borrowed + w.quote.interest)}`
                      : ''}
                  </Typography>
                ),
              },
              {
                key: 'usdt',
                header: 'USDT (iso)',
                numeric: true,
                render: (w) => (
                  <Typography sx={monoSx} level="body-sm">
                    {formatNumber(w.quote.free)} free
                  </Typography>
                ),
              },
              {
                key: 'max',
                header: 'Max → Spot',
                numeric: true,
                render: (w) => (
                  <Typography sx={monoSx} level="body-sm">
                    {formatNumber(w.maxTransferableUsdt)}
                  </Typography>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (w) => (
                  <Chip
                    size="sm"
                    variant="soft"
                    color={
                      w.status === 'debt'
                        ? 'danger'
                        : w.status === 'ready_to_sweep'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {w.status === 'debt'
                      ? 'Debt'
                      : w.status === 'ready_to_sweep'
                        ? 'Ready to sweep'
                        : 'Clear'}
                  </Chip>
                ),
              },
              {
                key: 'actions',
                header: '',
                render: (w) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    <Button
                      size="sm"
                      variant="outlined"
                      color="neutral"
                      disabled={marginPending || !w.hasDebt}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Repay borrow for ${w.symbol}? May transfer USDT from Spot to this isolated wallet.`,
                          )
                        ) {
                          return;
                        }
                        marginRepay.mutate(w.symbol);
                      }}
                    >
                      Repay
                    </Button>
                    <Button
                      size="sm"
                      variant="outlined"
                      color="primary"
                      disabled={
                        marginPending || w.hasDebt || w.maxTransferableUsdt <= 0.01
                      }
                      onClick={() => {
                        if (
                          !window.confirm(`Transfer max USDT from ${w.symbol} isolated to Spot?`)
                        ) {
                          return;
                        }
                        marginTransfer.mutate(w.symbol);
                      }}
                    >
                      Transfer
                    </Button>
                    <Button
                      size="sm"
                      color="success"
                      disabled={marginPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Settle ${w.symbol}? Repay any borrow, then sweep USDT to Spot.`,
                          )
                        ) {
                          return;
                        }
                        marginSettle.mutate(w.symbol);
                      }}
                    >
                      Settle
                    </Button>
                  </Box>
                ),
              },
            ]}
          />
        </Box>
      )}

      <Typography level="title-md" sx={{ mb: 1.5 }}>
        Open Positions
      </Typography>
      {actionError && (
        <Alert
          color="danger"
          sx={{ mb: 1 }}
          endDecorator={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {lastCloseTradeId &&
                /shortfall|insufficient|cannot close/i.test(actionError) && (
                  <Button
                    size="sm"
                    color="warning"
                    variant="solid"
                    disabled={closeTrade.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Close the largest size Spot + isolated USDT can fund? Remainder stays open until you add funds and close again.',
                        )
                      ) {
                        return;
                      }
                      closeTrade.mutate({ tradeId: lastCloseTradeId, affordable: true });
                    }}
                  >
                    Close max affordable
                  </Button>
                )}
              <IconButton size="sm" variant="plain" color="danger" onClick={clearActionError}>
                <Close />
              </IconButton>
            </Box>
          }
        >
          {actionError}
        </Alert>
      )}
      {copyInfo && (
        <Alert
          color="success"
          sx={{ mb: 1 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="success" onClick={() => setCopyInfo(null)}>
              <Close />
            </IconButton>
          }
        >
          {copyInfo}
        </Alert>
      )}
      <ResponsiveRecordList
        rows={openPositions}
        getRowKey={(p) => String(p._id)}
        emptyTitle="No open positions"
        cardTitle={(p) => (
          <Typography level="title-md" sx={monoSx}>
            {String(p.symbol)}
          </Typography>
        )}
        cardMeta={(p) => {
          const ctx = contextByPosition.get(String(p._id));
          return (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                columnGap: 1.5,
                rowGap: 1,
              }}
            >
              <SideChip side={String(p.side)} />
              <PnlText value={Number(p.unrealizedPnl)} />
              {p.partialTpDone ? (
                <Chip size="sm" variant="soft" color="neutral">
                  Partial taken
                </Chip>
              ) : null}
              {ctx ? (
                <BiasChip aligned={ctx.aligned} suggestion={ctx.suggestion} message={ctx.message} />
              ) : null}
            </Box>
          );
        }}
        cardFields={[
          {
            label: 'Qty',
            render: (p) => (
              <Box>
                <Typography sx={monoSx}>{Number(p.qty).toPrecision(6)}</Typography>
                {p.partialTpDone ? (
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    remaining — uPnL on this size only
                  </Typography>
                ) : null}
              </Box>
            ),
          },
          { label: 'Entry', render: (p) => <Typography sx={monoSx}>{formatPrice(Number(p.entryPrice))}</Typography> },
          { label: 'Mark', render: (p) => <Typography sx={monoSx}>{formatPrice(Number(p.currentPrice))}</Typography> },
          {
            label: 'uPnL',
            render: (p) => (
              <Box>
                <PnlText value={Number(p.unrealizedPnl)} />
                {p.partialTpDone ? (
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    open size only (partial already banked)
                  </Typography>
                ) : null}
              </Box>
            ),
          },
          {
            label: 'SL',
            render: (p) => (
              <Typography sx={monoSx}>{p.stopLoss ? formatPrice(Number(p.stopLoss)) : '—'}</Typography>
            ),
          },
          {
            label: 'TP',
            render: (p) => (
              <Typography sx={monoSx}>{p.takeProfit ? formatPrice(Number(p.takeProfit)) : '—'}</Typography>
            ),
          },
          {
            label: 'Regime',
            render: (p) => {
              const ctx = contextByPosition.get(String(p._id));
              return ctx ? <RegimeChip regime={ctx.regime} /> : '—';
            },
          },
          {
            label: 'HTF',
            render: (p) => {
              const ctx = contextByPosition.get(String(p._id));
              return ctx?.htfTrend
                ? `${ctx.htfTrend}${ctx.htfTimeframe ? ` (${ctx.htfTimeframe})` : ''}`
                : '—';
            },
          },
        ]}
        cardActions={(p) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>{renderActions(p)}</Box>
        )}
        expandedContent={(p) => {
          const id = String(p._id);
          const ctx = contextByPosition.get(id);
          const editing = editPositionId === id;
          const chartOpen = chartPositionId === id;
          if (!editing && !chartOpen) return null;
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {editing && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    alignItems: 'flex-end',
                  }}
                >
                  <FormControl sx={{ minWidth: 140 }}>
                    <FormLabel>Stop loss</FormLabel>
                    <Input
                      type="number"
                      value={editSl}
                      onChange={(e) => setEditSl(e.target.value)}
                      slotProps={{ input: { step: 'any', min: 0 } }}
                    />
                  </FormControl>
                  <FormControl sx={{ minWidth: 140 }}>
                    <FormLabel>Take profit</FormLabel>
                    <Input
                      type="number"
                      value={editTp}
                      onChange={(e) => setEditTp(e.target.value)}
                      slotProps={{ input: { step: 'any', min: 0 } }}
                    />
                  </FormControl>
                  <Button
                    size="sm"
                    loading={updateLevels.isPending}
                    disabled={updateLevels.isPending}
                    onClick={saveEdit}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="plain"
                    color="neutral"
                    onClick={() => setEditPositionId(null)}
                  >
                    Cancel
                  </Button>
                </Box>
              )}
              {chartOpen && (
                <CandleChart
                  symbol={String(p.symbol)}
                  interval={ctx?.timeframe ?? '1h'}
                  height={280}
                  entry={Number(p.entryPrice)}
                  stopLoss={p.stopLoss != null ? Number(p.stopLoss) : undefined}
                  takeProfit={p.takeProfit != null ? Number(p.takeProfit) : undefined}
                />
              )}
            </Box>
          );
        }}
        columns={[
          { key: 'symbol', header: 'Symbol', render: (p) => <Typography sx={monoSx}>{String(p.symbol)}</Typography> },
          { key: 'side', header: 'Side', render: (p) => <SideChip side={String(p.side)} /> },
          {
            key: 'qty',
            header: 'Qty',
            numeric: true,
            render: (p) => (
              <Box>
                <Typography sx={monoSx}>{Number(p.qty).toPrecision(6)}</Typography>
                {p.partialTpDone ? (
                  <Chip size="sm" variant="soft" color="neutral" sx={{ mt: 0.25 }}>
                    remaining
                  </Chip>
                ) : null}
              </Box>
            ),
          },
          { key: 'entry', header: 'Entry', numeric: true, render: (p) => formatPrice(Number(p.entryPrice)) },
          { key: 'mark', header: 'Mark', numeric: true, render: (p) => formatPrice(Number(p.currentPrice)) },
          {
            key: 'upnl',
            header: 'uPnL',
            render: (p) => (
              <Box>
                <PnlText value={Number(p.unrealizedPnl)} />
                {p.partialTpDone ? (
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', display: 'block' }}>
                    on remaining
                  </Typography>
                ) : null}
              </Box>
            ),
          },
          { key: 'sl', header: 'SL', numeric: true, render: (p) => (p.stopLoss ? formatPrice(Number(p.stopLoss)) : '—') },
          { key: 'tp', header: 'TP', numeric: true, render: (p) => (p.takeProfit ? formatPrice(Number(p.takeProfit)) : '—') },
          {
            key: 'regime',
            header: 'Regime',
            render: (p) => {
              const ctx = contextByPosition.get(String(p._id));
              return ctx ? <RegimeChip regime={ctx.regime} /> : '—';
            },
          },
          {
            key: 'htf',
            header: 'HTF',
            render: (p) => {
              const ctx = contextByPosition.get(String(p._id));
              return ctx?.htfTrend
                ? `${ctx.htfTrend}${ctx.htfTimeframe ? ` (${ctx.htfTimeframe})` : ''}`
                : '—';
            },
          },
          {
            key: 'bias',
            header: 'Bias',
            render: (p) => {
              const ctx = contextByPosition.get(String(p._id));
              return ctx ? (
                <BiasChip aligned={ctx.aligned} suggestion={ctx.suggestion} message={ctx.message} />
              ) : (
                '—'
              );
            },
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (p) => (
              <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {renderActions(p)}
              </Box>
            ),
          },
        ]}
      />

      <Typography level="title-md" sx={{ mb: 1.5, mt: 4 }}>
        Recent winners
      </Typography>
      <ResponsiveRecordList
        rows={recentWinners}
        getRowKey={(t) => String(t._id)}
        emptyTitle="No winning closed trades yet"
        cardTitle={(t) => (
          <Typography level="title-md" sx={monoSx}>
            {String(t.symbol)}
          </Typography>
        )}
        cardMeta={(t) => (
          <>
            <SideChip side={String(t.side)} />
            <PnlText value={Number(t.realizedPnl ?? 0)} />
          </>
        )}
        cardFields={[
          {
            label: 'Closed',
            render: (t) => {
              const raw = t.closedAt ?? t.updatedAt;
              return raw ? new Date(String(raw)).toLocaleString() : '—';
            },
          },
          {
            label: 'Exit',
            render: (t) => (
              <Typography sx={monoSx}>
                {t.exitPrice ? formatPrice(Number(t.exitPrice)) : '—'}
              </Typography>
            ),
          },
        ]}
        cardActions={(t) => (
          <Button
            size="sm"
            variant="outlined"
            color="neutral"
            disabled={copyTrade.isPending}
            onClick={() => {
              setCopyInfo(null);
              copyTrade.mutate(String(t._id));
            }}
          >
            Rescan
          </Button>
        )}
        columns={[
          {
            key: 'symbol',
            header: 'Symbol',
            render: (t) => <Typography sx={monoSx}>{String(t.symbol)}</Typography>,
          },
          { key: 'side', header: 'Side', render: (t) => <SideChip side={String(t.side)} /> },
          {
            key: 'pnl',
            header: 'PnL',
            render: (t) => <PnlText value={Number(t.realizedPnl ?? 0)} />,
          },
          {
            key: 'closed',
            header: 'Closed',
            render: (t) => {
              const raw = t.closedAt ?? t.updatedAt;
              return raw ? new Date(String(raw)).toLocaleString() : '—';
            },
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (t) => (
              <Button
                size="sm"
                variant="outlined"
                color="neutral"
                disabled={copyTrade.isPending}
                onClick={() => {
                  setCopyInfo(null);
                  copyTrade.mutate(String(t._id));
                }}
              >
                Rescan
              </Button>
            ),
          },
        ]}
      />
    </Box>
  );
}
