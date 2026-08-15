import Box from '@mui/joy/Box';
import Chip from '@mui/joy/Chip';
import Typography from '@mui/joy/Typography';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, portfolioApi, scannerApi, tradesApi } from '../api';
import { useLiveStore } from '../stores/liveStore';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { SideChip } from '../components/SideChip';
import { StatusChip } from '../components/StatusChip';
import { PnlText } from '../components/PnlText';
import { KeyValueList } from '../components/ResponsiveRecordList';
import { formatNumber } from '../utils/format';
import { monoSx } from '../theme/theme';

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
  const todayPnl = Number(portfolio?.todayPnl ?? 0);

  return (
    <Box>
      <PageHeader title="Home" subtitle="Spot terminal overview" />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          mb: 3.5,
        }}
      >
        <StatCard
          label="Today's PnL"
          value={formatNumber(todayPnl)}
          tone={todayPnl > 0 ? 'positive' : todayPnl < 0 ? 'negative' : 'neutral'}
        />
        <StatCard label="Win Rate" value={`${((analytics?.winRate ?? 0) * 100).toFixed(1)}%`} />
        <StatCard label="Open Positions" value={String(portfolio?.openPositions ?? 0)} />
        <StatCard label="Equity" value={formatNumber(portfolio?.equity ?? 0)} />
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography level="title-md">Top Opportunities</Typography>
            <Chip size="sm" variant="soft" color={status?.running ? 'success' : 'neutral'}>
              {status?.running ? 'Scanner on' : 'Scanner off'}
            </Chip>
          </Box>
          <KeyValueList
            emptyTitle="No opportunities yet"
            items={opportunities.slice(0, 5).map((o, i) => ({
              key: String(o._id ?? `${o.symbol}-${o.timeframe ?? ''}-${o.side ?? ''}-${i}`),
              primary: String(o.symbol),
              secondary: String(o.timeframe ?? ''),
              trailing: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SideChip side={String(o.side)} />
                  <Typography level="body-sm" sx={monoSx}>
                    {Number(o.confidence).toFixed(1)}%
                  </Typography>
                </Box>
              ),
            }))}
          />
        </Box>
        <Box>
          <Typography level="title-md" sx={{ mb: 1.5 }}>
            Recent Trades
          </Typography>
          <KeyValueList
            emptyTitle="No trades yet"
            items={trades.slice(0, 5).map((t) => ({
              key: String(t._id),
              primary: String(t.symbol),
              secondary: String(t.side),
              trailing: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StatusChip status={String(t.status)} />
                  <PnlText value={Number(t.realizedPnl ?? 0)} />
                </Box>
              ),
            }))}
          />
        </Box>
      </Box>
    </Box>
  );
}
