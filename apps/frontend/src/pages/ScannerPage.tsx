import { useState } from 'react';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scannerApi } from '../api';
import { useLiveStore } from '../stores/liveStore';
import { RegimeChip } from '../components/RegimeChip';
import { SideChip } from '../components/SideChip';
import { EntryTimingChip } from '../components/EntryTimingChip';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { PageHeader } from '../components/PageHeader';
import { ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatPrice } from '../utils/format';
import { monoSx } from '../theme/theme';

export function ScannerPage() {
  const [minConfidence, setMinConfidence] = useState(70);
  const [timeframe, setTimeframe] = useState('');
  const [side, setSide] = useState('');
  const [search, setSearch] = useState('');
  const live = useLiveStore((s) => s.opportunities) as unknown as Array<Record<string, unknown>>;
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['opportunities', minConfidence, timeframe, side, search],
    queryFn: () =>
      scannerApi.opportunities({
        minConfidence,
        timeframe: timeframe || undefined,
        side: side || undefined,
        search: search || undefined,
      }),
    refetchInterval: 15_000,
  });
  const { data: status } = useQuery({
    queryKey: ['scanner-status'],
    queryFn: scannerApi.status,
    refetchInterval: 5_000,
  });
  const start = useMutation({
    mutationFn: scannerApi.start,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanner-status'] }),
  });
  const stop = useMutation({
    mutationFn: scannerApi.stop,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanner-status'] }),
  });

  const items = ((live.length ? live : (data?.items ?? [])) as Array<Record<string, unknown>>).filter(
    (o: Record<string, unknown>) => {
      if (Number(o.confidence) < minConfidence) return false;
      if (timeframe && o.timeframe !== timeframe) return false;
      if (side && o.side !== side) return false;
      if (search && !String(o.symbol).toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    },
  );

  return (
    <Box>
      <PageHeader
        title="Scanner"
        subtitle="Runs on the server and continues even if you close the browser."
        actions={
          <>
            <Button variant="outlined" onClick={() => start.mutate()} disabled={status?.running}>
              Start
            </Button>
            <Button
              variant="outlined"
              color="warning"
              onClick={() => stop.mutate()}
              disabled={!status?.running}
            >
              Stop
            </Button>
          </>
        }
      />
      <Sheet
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr) minmax(0, 1fr)',
            md: 'repeat(4, minmax(0, 1fr)) auto',
          },
          alignItems: 'end',
          borderRadius: 'md',
        }}
      >
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Min confidence</FormLabel>
          <Input
            type="number"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            sx={{ width: '100%' }}
          />
        </FormControl>
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Timeframe</FormLabel>
          <Select
            value={timeframe}
            onChange={(_, v) => setTimeframe(v ?? '')}
            sx={{ minWidth: 0, width: '100%' }}
          >
            <Option value="">All</Option>
            {['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((t) => (
              <Option key={t} value={t}>
                {t}
              </Option>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Side</FormLabel>
          <Select
            value={side}
            onChange={(_, v) => setSide(v ?? '')}
            sx={{ minWidth: 0, width: '100%' }}
          >
            <Option value="">All</Option>
            <Option value="BUY">BUY</Option>
            <Option value="SELL">SELL</Option>
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', md: 'auto' } }}>
          <FormLabel>Search</FormLabel>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pair"
            sx={{ width: '100%' }}
          />
        </FormControl>
        <Typography
          level="body-sm"
          sx={{
            color: 'text.secondary',
            gridColumn: { xs: '1 / -1', md: 'auto' },
            pb: { md: 0.75 },
          }}
        >
          Scanned: {status?.pairsScanned ?? 0} · Found: {status?.opportunitiesFound ?? 0}
        </Typography>
      </Sheet>
      <ResponsiveRecordList
        rows={items}
        getRowKey={(o) => String(o._id ?? `${o.symbol}-${o.timeframe}`)}
        emptyTitle="No opportunities match filters"
        cardTitle={(o) => (
          <Typography level="title-md" sx={monoSx}>
            {String(o.symbol)}
          </Typography>
        )}
        cardMeta={(o) => (
          <>
            <SideChip side={String(o.side)} />
            <EntryTimingChip entryTiming={o.entryTiming} strategyIds={o.strategyIds} />
            {o.regime ? <RegimeChip regime={String(o.regime)} /> : null}
          </>
        )}
        cardFields={[
          { label: 'Confidence', render: (o) => <ConfidenceBar value={Number(o.confidence)} /> },
          { label: 'RR', render: (o) => <Typography sx={monoSx}>{Number(o.riskReward).toFixed(2)}</Typography> },
          { label: 'Entry', render: (o) => <Typography sx={monoSx}>{formatPrice(Number(o.entry))}</Typography> },
          { label: 'SL', render: (o) => <Typography sx={monoSx}>{formatPrice(Number(o.stopLoss))}</Typography> },
          { label: 'TP', render: (o) => <Typography sx={monoSx}>{formatPrice(Number(o.takeProfit))}</Typography> },
          { label: 'TF', render: (o) => String(o.timeframe) },
          { label: 'Strategy', render: (o) => String(o.primaryStrategy) },
          { label: 'Duration', render: (o) => String(o.estimatedDuration ?? '—') },
        ]}
        columns={[
          { key: 'rank', header: '#', render: (o) => String(o.rank ?? '—') },
          { key: 'pair', header: 'Pair', render: (o) => <Typography sx={monoSx}>{String(o.symbol)}</Typography> },
          { key: 'side', header: 'Side', render: (o) => <SideChip side={String(o.side)} /> },
          {
            key: 'timing',
            header: 'Timing',
            render: (o) => <EntryTimingChip entryTiming={o.entryTiming} strategyIds={o.strategyIds} />,
          },
          { key: 'regime', header: 'Regime', render: (o) => (o.regime ? <RegimeChip regime={String(o.regime)} /> : '—') },
          { key: 'conf', header: 'Confidence', numeric: true, render: (o) => `${Number(o.confidence).toFixed(1)}%` },
          { key: 'entry', header: 'Entry', numeric: true, render: (o) => formatPrice(Number(o.entry)) },
          { key: 'sl', header: 'SL', numeric: true, render: (o) => formatPrice(Number(o.stopLoss)) },
          { key: 'tp', header: 'TP', numeric: true, render: (o) => formatPrice(Number(o.takeProfit)) },
          { key: 'rr', header: 'RR', numeric: true, render: (o) => Number(o.riskReward).toFixed(2) },
          { key: 'strategy', header: 'Strategy', render: (o) => String(o.primaryStrategy) },
          { key: 'tf', header: 'TF', render: (o) => String(o.timeframe) },
          { key: 'dur', header: 'Duration', render: (o) => String(o.estimatedDuration ?? '—') },
        ]}
      />
    </Box>
  );
}
