import { useState } from 'react';
import { Alert, Box, Button, MenuItem, Paper, TextField, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { STRATEGY_IDS } from '@trading-os/shared';
import { backtestApi } from '../api';

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
      <Typography variant="h4" sx={{ mb: 2 }}>
        Backtest
      </Typography>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField select label="Strategy" value={strategyId} onChange={(e) => setStrategyId(e.target.value)} sx={{ minWidth: 200 }}>
          {STRATEGY_IDS.map((id) => (
            <MenuItem key={id} value={id}>{id}</MenuItem>
          ))}
        </TextField>
        <TextField label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
        <TextField select label="Interval" value={interval} onChange={(e) => setIntervalTf(e.target.value)} sx={{ width: 120 }}>
          {['15m', '1h', '4h', '1d'].map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? 'Running…' : 'Run (30d)'}
        </Button>
      </Paper>

      {run.isError && <Alert severity="error" sx={{ mb: 2 }}>{(run.error as Error).message}</Alert>}

      {metrics && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, mb: 2 }}>
          {[
            ['Win Rate', `${(metrics.winRate * 100).toFixed(1)}%`],
            ['Loss Rate', `${(metrics.lossRate * 100).toFixed(1)}%`],
            ['Profit Factor', metrics.profitFactor.toFixed(2)],
            ['Max DD', `${(metrics.maxDrawdown * 100).toFixed(1)}%`],
            ['Avg Profit', metrics.averageProfit.toFixed(2)],
            ['Net Profit', metrics.netProfit.toFixed(2)],
          ].map(([label, value]) => (
            <Paper key={label} sx={{ p: 2 }}>
              <Typography variant="subtitle2">{label}</Typography>
              <Typography variant="h6" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{value}</Typography>
            </Paper>
          ))}
        </Box>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        Recent runs
      </Typography>
      <Paper sx={{ p: 2 }}>
        {(runs?.items ?? []).map((r: Record<string, unknown>) => (
          <Box key={String(r._id)} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography>{String(r.strategyId)} · {String(r.symbol)} · {String(r.interval)}</Typography>
            <Typography>{String(r.status)}</Typography>
            <Typography>
              {r.metrics ? `PF ${(r.metrics as { profitFactor: number }).profitFactor.toFixed(2)}` : '—'}
            </Typography>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
