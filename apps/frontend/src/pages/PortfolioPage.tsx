import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import IconButton from '@mui/joy/IconButton';
import Input from '@mui/joy/Input';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import Close from '@mui/icons-material/Close';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { portfolioApi, positionsApi, tradesApi } from '../api';
import { RegimeChip } from '../components/RegimeChip';
import { BiasChip } from '../components/BiasChip';
import { CandleChart } from '../components/CandleChart';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { SideChip } from '../components/SideChip';
import { PnlText } from '../components/PnlText';
import { KeyValueList, ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatDateTime, formatNumber, formatPrice } from '../utils/format';
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
  const contextByPosition = new Map<string, PositionContext>(
    ((contexts?.items ?? []) as PositionContext[]).map((c) => [c.positionId, c]),
  );
  const { data: ledger } = useQuery({
    queryKey: ['paper-ledger'],
    queryFn: portfolioApi.ledger,
    enabled: summary?.mode === 'paper',
  });

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [chartPositionId, setChartPositionId] = useState<string | null>(null);

  const closeTrade = useMutation({
    mutationFn: (tradeId: string) => tradesApi.close(tradeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['positions'] });
      qc.invalidateQueries({ queryKey: ['positions-context'] });
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });

  const deposit = useMutation({
    mutationFn: () => portfolioApi.deposit(Number(amount), note || undefined),
    onSuccess: () => {
      setAmount('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['paper-ledger'] });
    },
  });
  const withdraw = useMutation({
    mutationFn: () => portfolioApi.withdraw(Number(amount), note || undefined),
    onSuccess: () => {
      setAmount('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['paper-ledger'] });
    },
  });

  const isPaper = summary?.mode === 'paper';
  const fundError = deposit.error ?? withdraw.error;
  const openPositions = ((positions?.items ?? []) as Array<Record<string, unknown>>).filter(
    (p) => p.status === 'open',
  );
  const uPnl = Number(summary?.unrealizedPnl ?? 0);
  const rPnl = Number(summary?.realizedPnl ?? 0);

  return (
    <Box>
      <PageHeader title="Portfolio" subtitle="Balances, paper funding, and open spots" />
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' },
          mb: 2,
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
        <StatCard label="Starting balance" value={formatNumber(summary?.startingBalance ?? 0)} />
        <StatCard label="Mode" value={summary?.mode ?? 'paper'} />
      </Box>

      {isPaper && (
        <Sheet variant="outlined" sx={{ p: 2, mb: 3, display: 'grid', gap: 1.5, maxWidth: 520, borderRadius: 'md' }}>
          <Typography level="title-md">Fund paper account</Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Deposits and withdrawals adjust equity on top of starting balance and realized trade PnL.
          </Typography>
          {fundError && (
            <Alert
              color="danger"
              endDecorator={
                <IconButton
                  size="sm"
                  variant="plain"
                  color="danger"
                  onClick={() => {
                    deposit.reset();
                    withdraw.reset();
                  }}
                >
                  <Close />
                </IconButton>
              }
            >
              {errMsg(fundError)}
            </Alert>
          )}
          <FormControl>
            <FormLabel>Amount (USDT)</FormLabel>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel>Note (optional)</FormLabel>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button disabled={!Number(amount) || deposit.isPending} onClick={() => deposit.mutate()}>
              Deposit
            </Button>
            <Button
              variant="outlined"
              color="warning"
              disabled={!Number(amount) || withdraw.isPending}
              onClick={() => withdraw.mutate()}
            >
              Withdraw
            </Button>
          </Box>
        </Sheet>
      )}

      <Typography level="title-md" sx={{ mb: 1 }}>
        Balances
      </Typography>
      <Box sx={{ mb: 3 }}>
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

      {isPaper && (
        <Box sx={{ mb: 3 }}>
          <Typography level="title-md" sx={{ mb: 1 }}>
            Funding ledger
          </Typography>
          <KeyValueList
            emptyTitle="No deposits or withdrawals yet."
            items={(ledger?.items ?? []).map((e: Record<string, unknown>) => ({
              key: String(e._id),
              primary: String(e.type),
              secondary: String(e.note ?? formatDateTime(e.createdAt as string)),
              trailing: (
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={monoSx}>{Number(e.amount).toFixed(2)}</Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    {e.createdAt ? formatDateTime(String(e.createdAt)) : '—'}
                  </Typography>
                </Box>
              ),
            }))}
          />
        </Box>
      )}

      <Typography level="title-md" sx={{ mb: 1 }}>
        Open Positions
      </Typography>
      {closeTrade.isError && (
        <Alert
          color="danger"
          sx={{ mb: 1 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => closeTrade.reset()}>
              <Close />
            </IconButton>
          }
        >
          {errMsg(closeTrade.error)}
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
            <>
              <SideChip side={String(p.side)} />
              <PnlText value={Number(p.unrealizedPnl)} />
              {ctx ? <BiasChip aligned={ctx.aligned} suggestion={ctx.suggestion} message={ctx.message} /> : null}
            </>
          );
        }}
        cardFields={[
          { label: 'Qty', render: (p) => <Typography sx={monoSx}>{Number(p.qty).toPrecision(6)}</Typography> },
          { label: 'Entry', render: (p) => <Typography sx={monoSx}>{formatPrice(Number(p.entryPrice))}</Typography> },
          { label: 'Mark', render: (p) => <Typography sx={monoSx}>{formatPrice(Number(p.currentPrice))}</Typography> },
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
        cardActions={(p) => {
          const id = String(p._id);
          const chartOpen = chartPositionId === id;
          return (
            <>
              <Button
                variant={chartOpen ? 'solid' : 'outlined'}
                color="neutral"
                onClick={() => setChartPositionId(chartOpen ? null : id)}
              >
                Chart
              </Button>
              <Button
                color="warning"
                variant="outlined"
                disabled={closeTrade.isPending}
                onClick={() => closeTrade.mutate(String(p.tradeId))}
              >
                Close
              </Button>
            </>
          );
        }}
        expandedContent={(p) => {
          const id = String(p._id);
          if (chartPositionId !== id) return null;
          const ctx = contextByPosition.get(id);
          return (
            <CandleChart
              symbol={String(p.symbol)}
              interval={ctx?.timeframe ?? '1h'}
              height={280}
              entry={Number(p.entryPrice)}
              stopLoss={p.stopLoss != null ? Number(p.stopLoss) : undefined}
              takeProfit={p.takeProfit != null ? Number(p.takeProfit) : undefined}
            />
          );
        }}
        columns={[
          { key: 'symbol', header: 'Symbol', render: (p) => <Typography sx={monoSx}>{String(p.symbol)}</Typography> },
          { key: 'side', header: 'Side', render: (p) => <SideChip side={String(p.side)} /> },
          { key: 'qty', header: 'Qty', numeric: true, render: (p) => Number(p.qty).toPrecision(6) },
          { key: 'entry', header: 'Entry', numeric: true, render: (p) => formatPrice(Number(p.entryPrice)) },
          { key: 'mark', header: 'Mark', numeric: true, render: (p) => formatPrice(Number(p.currentPrice)) },
          { key: 'upnl', header: 'uPnL', render: (p) => <PnlText value={Number(p.unrealizedPnl)} /> },
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
            render: (p) => {
              const id = String(p._id);
              const chartOpen = chartPositionId === id;
              return (
                <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end' }}>
                  <Button
                    size="sm"
                    variant={chartOpen ? 'solid' : 'outlined'}
                    color="neutral"
                    onClick={() => setChartPositionId(chartOpen ? null : id)}
                  >
                    Chart
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
                </Box>
              );
            },
          },
        ]}
      />
    </Box>
  );
}
