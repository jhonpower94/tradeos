import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import Refresh from '@mui/icons-material/Refresh';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { analyticsApi, portfolioApi, positionsApi, scannerApi, settingsApi, tradesApi } from '../api';
import { useLiveStore } from '../stores/liveStore';
import { PageHeader } from '../components/PageHeader';
import { EnableNotificationsBanner } from '../components/EnableNotificationsBanner';
import { StatCard } from '../components/StatCard';
import { SideChip } from '../components/SideChip';
import { StatusChip } from '../components/StatusChip';
import { PnlText } from '../components/PnlText';
import { KeyValueList } from '../components/ResponsiveRecordList';
import {
  formatBalanceAsOf,
  useBalanceRefresh,
  usePullToRefresh,
} from '../hooks/useBalanceRefresh';
import { formatNumber } from '../utils/format';
import { openTradeDisplayPnl, positionByTradeId } from '../utils/tradePnl';
import { sortByRankThenConfidence } from '../utils/sort';
import { monoSx } from '../theme/theme';

export function HomePage() {
  const liveOpps = useLiveStore((s) => s.opportunities) as unknown as Array<Record<string, unknown>>;
  const { refreshing, refreshBalances } = useBalanceRefresh();
  const {
    data: portfolio,
    dataUpdatedAt: portfolioUpdatedAt,
    isFetching: portfolioFetching,
  } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.summary,
    refetchInterval: 5_000,
  });
  const { data: analytics } = useQuery({ queryKey: ['analytics'], queryFn: analyticsApi.overview });
  const { data: oppsData } = useQuery({ queryKey: ['opportunities'], queryFn: () => scannerApi.opportunities() });
  const { data: tradesData } = useQuery({ queryKey: ['trades'], queryFn: tradesApi.list });
  const { data: positionsData } = useQuery({
    queryKey: ['positions'],
    queryFn: positionsApi.list,
    refetchInterval: 5_000,
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const { data: status } = useQuery({
    queryKey: ['scanner-status'],
    queryFn: scannerApi.status,
    refetchInterval: 10_000,
  });
  const { pullPx, pullBusy, pullHandlers } = usePullToRefresh(refreshBalances);
  const balancesRefreshing = refreshing || pullBusy || portfolioFetching;

  const opportunities = liveOpps.length ? liveOpps : ((oppsData?.items ?? []) as Array<Record<string, unknown>>);
  const topOpportunities = sortByRankThenConfidence(
    opportunities.filter((o) => o.status !== 'watching' && o.stage !== 'watching'),
  ).slice(0, 5);
  const trades = (tradesData?.items ?? []) as Array<Record<string, unknown>>;
  const openByTrade = positionByTradeId(
    (positionsData?.items ?? []) as Array<Record<string, unknown>>,
  );
  const todayPnl = Number(portfolio?.todayPnl ?? 0);
  const isLive = (settings?.trading?.mode ?? 'paper') === 'live';
  const showBinanceAlert = Boolean(settings) && isLive && !settings?.binance?.configured;

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
          }}
        >
          {pullBusy || refreshing ? 'Updating balances…' : 'Release to refresh'}
        </Typography>
      )}
      <PageHeader
        title="Home"
        subtitle="Spot terminal overview"
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

      <EnableNotificationsBanner />

      {showBinanceAlert && (
        <Sheet
          variant="outlined"
          sx={{
            mb: 3,
            px: { xs: 2, sm: 2.5 },
            py: { xs: 1.75, sm: 2 },
            borderRadius: 'lg',
            borderLeft: '3px solid',
            borderLeftColor: 'primary.500',
            bgcolor: 'background.level1',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography level="title-sm" sx={{ mb: 0.25 }}>
              Connect Binance
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Live mode needs Binance API keys for market data and execution.
            </Typography>
          </Box>
          <Button
            component={RouterLink}
            to="/settings?tab=binance"
            size="sm"
            variant="soft"
            color="primary"
            sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}
          >
            Open Settings
          </Button>
        </Sheet>
      )}

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
      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2, mt: -2 }}>
        {balancesRefreshing
          ? 'Updating…'
          : `Balances as of ${formatBalanceAsOf(portfolioUpdatedAt)}`}
      </Typography>

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
            items={topOpportunities.map((o, i) => ({
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
            items={trades.slice(0, 5).map((t) => {
              const pos = t.status === 'open' ? openByTrade.get(String(t._id)) : undefined;
              const pnl =
                t.status === 'open'
                  ? openTradeDisplayPnl(Number(t.realizedPnl ?? 0), Number(pos?.unrealizedPnl ?? 0))
                  : Number(t.realizedPnl ?? 0);
              return {
                key: String(t._id),
                primary: String(t.symbol),
                secondary: String(t.side),
                trailing: (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StatusChip status={String(t.status)} />
                    <PnlText value={pnl} />
                  </Box>
                ),
              };
            })}
          />
        </Box>
      </Box>
    </Box>
  );
}
