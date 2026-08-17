import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { KeyValueList } from '../components/ResponsiveRecordList';
import { PnlText } from '../components/PnlText';
import { formatNumber, formatPercent } from '../utils/format';

export function AnalyticsPage() {
  const { data } = useQuery({ queryKey: ['analytics'], queryFn: analyticsApi.overview });
  const netPnl = Number(data?.netPnl ?? 0);
  const netTone = netPnl > 0 ? 'positive' : netPnl < 0 ? 'negative' : 'neutral';

  const byStrategy = Object.entries(
    (data?.byStrategy ?? {}) as Record<string, { trades: number; pnl: number; wins: number }>,
  )
    .map(([id, s]) => ({
      id,
      trades: s.trades,
      pnl: s.pnl,
      winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);

  const cards: Array<{
    label: string;
    value: string;
    tone?: 'positive' | 'negative' | 'neutral';
  }> = [
    { label: 'Win Rate', value: formatPercent((data?.winRate ?? 0) * 100, 1) },
    {
      label: 'Profit Factor',
      value: Number.isFinite(data?.profitFactor) ? Number(data?.profitFactor).toFixed(2) : '∞',
    },
    { label: 'Sharpe', value: formatNumber(data?.sharpeRatio ?? 0) },
    { label: 'Max Drawdown', value: formatPercent((data?.maxDrawdown ?? 0) * 100, 1) },
    { label: 'Net PnL', value: formatNumber(netPnl), tone: netTone },
    { label: 'Trades', value: String(data?.tradeCount ?? 0) },
    { label: 'Best Strategy', value: data?.bestStrategy ?? '—' },
    { label: 'Worst Strategy', value: data?.worstStrategy ?? '—' },
  ];

  return (
    <Box>
      <PageHeader title="Analytics" subtitle="Closed-trade performance" />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone ?? 'neutral'} />
        ))}
      </Box>
      <Typography level="title-md" sx={{ mt: 4, mb: 1.5 }}>
        By Strategy
      </Typography>
      <KeyValueList
        emptyTitle="No closed trades yet"
        items={byStrategy.map((s) => ({
          key: s.id,
          primary: s.id.replace(/_/g, ' '),
          secondary: `${s.trades} trade${s.trades === 1 ? '' : 's'} · ${s.winRate.toFixed(1)}% win`,
          trailing: <PnlText value={s.pnl} />,
        }))}
      />
      <Typography level="title-md" sx={{ mt: 4, mb: 1.5 }}>
        Monthly Returns
      </Typography>
      <KeyValueList
        emptyTitle="No closed trades yet"
        items={(data?.monthlyReturns ?? []).map((m: { month: string; pnl: number }) => ({
          key: m.month,
          primary: m.month,
          trailing: <PnlText value={m.pnl} />,
        }))}
      />
    </Box>
  );
}
