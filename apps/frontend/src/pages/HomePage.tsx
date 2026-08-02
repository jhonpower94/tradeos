import { Box, Paper, Typography, Chip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, portfolioApi, scannerApi, tradesApi } from '../api';
import { useLiveStore } from '../stores/liveStore';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="subtitle2">{label}</Typography>
      <Typography variant="h4" sx={{ color: color ?? 'text.primary', fontFamily: 'IBM Plex Mono, monospace' }}>
        {value}
      </Typography>
    </Paper>
  );
}

export function HomePage() {
  const liveOpps = useLiveStore((s) => s.opportunities) as unknown as Array<Record<string, unknown>>;
  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: portfolioApi.summary });
  const { data: analytics } = useQuery({ queryKey: ['analytics'], queryFn: analyticsApi.overview });
  const { data: oppsData } = useQuery({ queryKey: ['opportunities'], queryFn: () => scannerApi.opportunities() });
  const { data: tradesData } = useQuery({ queryKey: ['trades'], queryFn: tradesApi.list });
  const { data: status } = useQuery({
    queryKey: ['scanner-status'],
    queryFn: scannerApi.status,
    refetchInterval: 10_000,
  });

  const opportunities = liveOpps.length ? liveOpps : ((oppsData?.items ?? []) as Array<Record<string, unknown>>);
  const trades = (tradesData?.items ?? []) as Array<Record<string, unknown>>;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Home
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
          mb: 2,
        }}
      >
        <Stat
          label="Today's PnL"
          value={(portfolio?.todayPnl ?? 0).toFixed(2)}
          color={portfolio?.todayPnl >= 0 ? 'long.main' : 'short.main'}
        />
        <Stat label="Win Rate" value={`${((analytics?.winRate ?? 0) * 100).toFixed(1)}%`} />
        <Stat label="Open Positions" value={String(portfolio?.openPositions ?? 0)} />
        <Stat label="Equity" value={(portfolio?.equity ?? 0).toFixed(2)} />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6">Top Opportunities</Typography>
            <Chip
              size="small"
              label={status?.running ? 'Scanner on' : 'Scanner off'}
              color={status?.running ? 'success' : 'default'}
            />
          </Box>
          {opportunities.slice(0, 5).map((o: Record<string, unknown>) => (
            <Box
              key={String(o._id ?? o.symbol)}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                py: 0.75,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{String(o.symbol)}</Typography>
              <Typography color={o.side === 'BUY' ? 'long.main' : 'short.main'}>{String(o.side)}</Typography>
              <Typography>{Number(o.confidence).toFixed(1)}%</Typography>
            </Box>
          ))}
          {!opportunities.length && <Typography color="text.secondary">No opportunities yet</Typography>}
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Recent Trades
          </Typography>
          {trades.slice(0, 5).map((t: Record<string, unknown>) => (
            <Box
              key={String(t._id)}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                py: 0.75,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{String(t.symbol)}</Typography>
              <Typography>{String(t.status)}</Typography>
              <Typography color={Number(t.realizedPnl) >= 0 ? 'long.main' : 'short.main'}>
                {Number(t.realizedPnl ?? 0).toFixed(2)}
              </Typography>
            </Box>
          ))}
          {!trades.length && <Typography color="text.secondary">No trades yet</Typography>}
        </Paper>
      </Box>
    </Box>
  );
}
