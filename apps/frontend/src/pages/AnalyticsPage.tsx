import { Box, Paper, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';

export function AnalyticsPage() {
  const { data } = useQuery({ queryKey: ['analytics'], queryFn: analyticsApi.overview });

  const cards = [
    { label: 'Win Rate', value: `${((data?.winRate ?? 0) * 100).toFixed(1)}%` },
    { label: 'Profit Factor', value: Number.isFinite(data?.profitFactor) ? Number(data?.profitFactor).toFixed(2) : '∞' },
    { label: 'Sharpe', value: (data?.sharpeRatio ?? 0).toFixed(2) },
    { label: 'Max Drawdown', value: `${((data?.maxDrawdown ?? 0) * 100).toFixed(1)}%` },
    { label: 'Net PnL', value: (data?.netPnl ?? 0).toFixed(2) },
    { label: 'Trades', value: String(data?.tradeCount ?? 0) },
    { label: 'Best Strategy', value: data?.bestStrategy ?? '—' },
    { label: 'Worst Strategy', value: data?.worstStrategy ?? '—' },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Analytics
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        {cards.map((c) => (
          <Paper key={c.label} sx={{ p: 2 }}>
            <Typography variant="subtitle2">{c.label}</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'IBM Plex Mono, monospace', mt: 1 }}>
              {c.value}
            </Typography>
          </Paper>
        ))}
      </Box>
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Monthly Returns
        </Typography>
        {(data?.monthlyReturns ?? []).map((m: { month: string; pnl: number }) => (
          <Box key={m.month} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
            <Typography>{m.month}</Typography>
            <Typography color={m.pnl >= 0 ? 'long.main' : 'short.main'}>{m.pnl.toFixed(2)}</Typography>
          </Box>
        ))}
        {!data?.monthlyReturns?.length && <Typography color="text.secondary">No closed trades yet</Typography>}
      </Paper>
    </Box>
  );
}
