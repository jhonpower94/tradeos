import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery } from '@tanstack/react-query';
import { STRATEGY_IDS } from '@trading-os/shared';
import { backtestApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { StatusChip } from '../components/StatusChip';
import { KeyValueList } from '../components/ResponsiveRecordList';
import { formatNumber, formatPercent } from '../utils/format';

export function BacktestPage() {
  const [strategyId, setStrategyId] = useState<string>(STRATEGY_IDS[0]);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIntervalTf] = useState('1h');
  const { data: runs } = useQuery({ queryKey: ['backtests'], queryFn: backtestApi.list });
  const run = useMutation({
    mutationFn: () => {
      const end = Date.now();
      const start = end - 30 * 24 * 60 * 60 * 1000;
      return backtestApi.run({
        strategyId,
        symbol,
        interval,
        startTime: start,
        endTime: end,
        initialCapital: 10_000,
      });
    },
  });

  const metrics = run.data?.run?.metrics;

  return (
    <Box>
      <PageHeader title="Backtest" subtitle="Replay a strategy over the last 30 days" />
      <Sheet
        variant="outlined"
        sx={{
          p: 1.5,
          mb: 2,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr auto auto' },
          alignItems: 'end',
          borderRadius: 'md',
        }}
      >
        <FormControl>
          <FormLabel>Strategy</FormLabel>
          <Select value={strategyId} onChange={(_, v) => v && setStrategyId(v)}>
            {STRATEGY_IDS.map((id) => (
              <Option key={id} value={id}>
                {id}
              </Option>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel>Symbol</FormLabel>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
        </FormControl>
        <FormControl>
          <FormLabel>Interval</FormLabel>
          <Select value={interval} onChange={(_, v) => v && setIntervalTf(v)}>
            {['15m', '1h', '4h', '1d'].map((t) => (
              <Option key={t} value={t}>
                {t}
              </Option>
            ))}
          </Select>
        </FormControl>
        <Button onClick={() => run.mutate()} disabled={run.isPending} sx={{ minHeight: 36 }}>
          {run.isPending ? 'Running…' : 'Run (30d)'}
        </Button>
      </Sheet>

      {run.isError && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {(run.error as Error).message}
        </Alert>
      )}

      {metrics && (
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
            mb: 2,
          }}
        >
          <StatCard label="Win Rate" value={formatPercent(metrics.winRate * 100, 1)} />
          <StatCard label="Loss Rate" value={formatPercent(metrics.lossRate * 100, 1)} />
          <StatCard label="Profit Factor" value={metrics.profitFactor.toFixed(2)} />
          <StatCard label="Max DD" value={formatPercent(metrics.maxDrawdown * 100, 1)} />
          <StatCard label="Avg Profit" value={formatNumber(metrics.averageProfit)} />
          <StatCard
            label="Net Profit"
            value={formatNumber(metrics.netProfit)}
            tone={metrics.netProfit > 0 ? 'positive' : metrics.netProfit < 0 ? 'negative' : 'neutral'}
          />
        </Box>
      )}

      <Typography level="title-md" sx={{ mb: 1 }}>
        Recent runs
      </Typography>
      <KeyValueList
        emptyTitle="No backtests yet"
        items={(runs?.items ?? []).map((r: Record<string, unknown>) => ({
          key: String(r._id),
          primary: `${String(r.strategyId)} · ${String(r.symbol)} · ${String(r.interval)}`,
          trailing: (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StatusChip status={String(r.status)} />
              {r.metrics
                ? `PF ${(r.metrics as { profitFactor: number }).profitFactor.toFixed(2)}`
                : '—'}
            </Box>
          ),
        }))}
      />
    </Box>
  );
}
