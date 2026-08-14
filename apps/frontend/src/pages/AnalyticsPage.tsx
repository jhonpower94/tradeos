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
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone ?? 'neutral'} />
        ))}
      </Box>
      <Typography level="title-md" sx={{ mt: 2.5, mb: 1 }}>
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
