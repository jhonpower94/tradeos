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

export function PortfolioPage() {
  const qc = useQueryClient();
  const { data: summary } = useQuery({
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

  const invalidateTradeQueries = () => {
    qc.invalidateQueries({ queryKey: ['positions'] });
    qc.invalidateQueries({ queryKey: ['positions-context'] });
    qc.invalidateQueries({ queryKey: ['trades'] });
    qc.invalidateQueries({ queryKey: ['portfolio'] });
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['signals'] });
  };

  const closeTrade = useMutation({
    mutationFn: (tradeId: string) => tradesApi.close(tradeId),
    onSuccess: () => {
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
    (updateLevels.isError && errMsg(updateLevels.error)) ||
    null;

  const clearActionError = () => {
    closeTrade.reset();
    copyTrade.reset();
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
          color="warning"
          variant="outlined"
          disabled={closeTrade.isPending}
          onClick={() => closeTrade.mutate(String(p.tradeId))}
        >
          Close
        </Button>
      </>
    );
  };

  return (
    <Box>
      <PageHeader title="Portfolio" subtitle="Balances and open spots" />
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
          label="Free USDT"
          value={formatNumber(summary?.freeQuote ?? summary?.balances?.[0]?.free ?? 0)}
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

      <Typography level="title-md" sx={{ mb: 1.5 }}>
        Balances
      </Typography>
      <Box sx={{ mb: 4 }}>
        <KeyValueList
          emptyTitle="No balances"
          items={(summary?.balances ?? []).map((b: { asset: string; free: number; locked: number }) => ({
            key: b.asset,
            primary: b.asset,
            secondary: `Locked ${b.locked.toFixed(4)}`,
            trailing: <Typography sx={monoSx}>{b.free.toFixed(4)}</Typography>,
          }))}
        />
      </Box>

      <Typography level="title-md" sx={{ mb: 1.5 }}>
        Open Positions
      </Typography>
      {actionError && (
        <Alert
          color="danger"
          sx={{ mb: 1 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={clearActionError}>
              <Close />
            </IconButton>
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
