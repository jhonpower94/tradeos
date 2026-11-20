import { useEffect, useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import IconButton from '@mui/joy/IconButton';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import ToggleButtonGroup from '@mui/joy/ToggleButtonGroup';
import Typography from '@mui/joy/Typography';
import Close from '@mui/icons-material/Close';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { signalsApi, settingsApi } from '../api';
import { CandleChart } from '../components/CandleChart';
import { PageHeader } from '../components/PageHeader';
import { SideChip } from '../components/SideChip';
import { StatusChip } from '../components/StatusChip';
import { EntryTimingChip } from '../components/EntryTimingChip';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatDateTime, formatLocation, formatPrice, formatRelativeStrength, formatRelativeTime } from '../utils/format';
import { isWatchingRow, sortOpportunitiesForDisplay } from '../utils/sort';
import {
  matchesScannerViewFilters,
  scannerViewFiltersFromSettings,
  type ViewSide,
  type ViewStage,
  type ViewTimeframe,
} from '../utils/scannerViewFilters';
import { monoSx } from '../theme/theme';

function mutationErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

function fmt(n: unknown, digits = 6): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toPrecision(digits) : '—';
}

export function SignalsPage() {
  const [listMode, setListMode] = useState<'ranked' | 'history'>('ranked');
  const [chartSignalId, setChartSignalId] = useState<string | null>(null);
  const [, setNowTick] = useState(() => Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const filters = scannerViewFiltersFromSettings(settings?.scanner);

  const saveScanner = useMutation({
    mutationFn: (scanner: Record<string, unknown>) => settingsApi.update({ scanner }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['signals'] });
      void qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });

  const { data } = useQuery({
    queryKey: [
      'signals',
      listMode,
      filters.viewSide,
      filters.viewStage,
      filters.viewTimeframe,
      filters.minConfidence,
      filters.maxConfidence,
    ],
    queryFn: () => signalsApi.list({ view: listMode }),
    refetchInterval: 10_000,
  });
  const approve = useMutation({
    mutationFn: (id: string) => signalsApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['signals'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['positions'] });
    },
  });
  const reject = useMutation({
    mutationFn: (id: string) => signalsApi.reject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['signals'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });

  const rows = sortOpportunitiesForDisplay(
    ((data?.items ?? []) as Array<Record<string, unknown>>).filter((o) =>
      // History is unfiltered by the API; active lists also re-apply for live consistency.
      matchesScannerViewFilters(o, filters, { isWatching: isWatchingRow }),
    ),
    {
      minConfidence: filters.minConfidence,
      maxConfidence: filters.maxConfidence,
      preferMidConfidence: filters.preferMidConfidence,
    },
  );

  return (
    <Box>
      <PageHeader
        title="Signals"
        subtitle={
          listMode === 'ranked'
            ? 'Triggered is approve-now. Watching is at a level, waiting for confirmation.'
            : 'Past signals (executed, rejected, expired).'
        }
        actions={
          <ToggleButtonGroup
            size="sm"
            value={listMode}
            onChange={(_, v) => {
              if (v) {
                setListMode(v);
                setChartSignalId(null);
              }
            }}
          >
            <Button value="ranked">Active</Button>
            <Button value="history">History</Button>
          </ToggleButtonGroup>
        }
      />
      <Sheet
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr) minmax(0, 1fr)',
            md: 'repeat(3, minmax(0, 1fr))',
          },
          alignItems: 'end',
          borderRadius: 'md',
        }}
      >
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Timeframe</FormLabel>
          <Select
            value={filters.viewTimeframe === 'ALL' ? 'ALL' : filters.viewTimeframe}
            onChange={(_, v) => {
              const next = (v ?? 'ALL') as ViewTimeframe;
              if (next === filters.viewTimeframe) return;
              saveScanner.mutate({ viewTimeframe: next });
            }}
            sx={{ width: '100%' }}
          >
            <Option value="ALL">All</Option>
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
            value={filters.viewSide}
            onChange={(_, v) => {
              const next = (v ?? 'ALL') as ViewSide;
              if (next === filters.viewSide) return;
              saveScanner.mutate({ viewSide: next });
            }}
            sx={{ width: '100%' }}
          >
            <Option value="ALL">All</Option>
            <Option value="BUY">BUY</Option>
            <Option value="SELL">SELL</Option>
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Stage</FormLabel>
          <Select
            value={filters.viewStage}
            onChange={(_, v) => {
              const next = (v ?? 'ALL') as ViewStage;
              if (next === filters.viewStage) return;
              saveScanner.mutate({ viewStage: next });
            }}
            sx={{ width: '100%' }}
          >
            <Option value="ALL">All</Option>
            <Option value="triggered">Triggered</Option>
            <Option value="watching">Watching</Option>
          </Select>
        </FormControl>
      </Sheet>
      {approve.isError && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => approve.reset()}>
              <Close />
            </IconButton>
          }
        >
          {mutationErrorMessage(approve.error)}
        </Alert>
      )}
      <ResponsiveRecordList
        stretch
        rows={rows}
        getRowKey={(s) => String(s._id)}
        emptyTitle={listMode === 'ranked' ? 'No active signals right now.' : 'No signal history yet.'}
        cardTitle={(s) => (
          <Typography level="title-md" sx={monoSx}>
            {String(s.symbol)}
          </Typography>
        )}
        cardMeta={(s) => (
          <>
            <SideChip side={String(s.side)} />
            <EntryTimingChip entryTiming={s.entryTiming} strategyIds={s.strategyIds} />
            <StatusChip status={String(s.status)} />
          </>
        )}
        cardFields={[
          { label: 'TF', render: (s) => String(s.timeframe ?? '—') },
          { label: 'Appeared', render: (s) => formatRelativeTime(s.createdAt as string) },
          { label: 'Location', render: (s) => formatLocation(s.locations) },
          { label: 'RS', render: (s) => formatRelativeStrength(s.relativeStrength) },
          { label: 'Confidence', render: (s) => <ConfidenceBar value={Number(s.confidence)} /> },
          { label: 'Entry', render: (s) => <Typography sx={monoSx}>{formatPrice(Number(s.entry))}</Typography> },
          { label: 'Strategy', render: (s) => String(s.primaryStrategy) },
        ]}
        cardActions={(s) => {
          const id = String(s._id);
          const chartOpen = chartSignalId === id;
          return (
            <>
              <Button
                variant={chartOpen ? 'solid' : 'outlined'}
                color="neutral"
                onClick={() => setChartSignalId(chartOpen ? null : id)}
              >
                Chart
              </Button>
              {listMode === 'ranked' && (s.status === 'ranked' || s.status === 'watching') && (
                <>
                  {s.status === 'ranked' && (
                    <Button
                      color="success"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(id)}
                    >
                      Approve
                    </Button>
                  )}
                  <Button color="warning" variant="outlined" onClick={() => reject.mutate(id)}>
                    Reject
                  </Button>
                </>
              )}
            </>
          );
        }}
        expandedContent={(s) => {
          const id = String(s._id);
          if (chartSignalId !== id) return null;
          const timeframe = String(s.timeframe ?? '1h');
          const appearedAt = s.createdAt as string | undefined;
          return (
            <Box>
              <Typography level="body-sm" sx={{ mb: 1.5, ...monoSx, color: 'text.secondary' }}>
                {String(s.side)} · {timeframe}
                {' · '}Entry {fmt(s.entry)}
                {' · '}SL {fmt(s.stopLoss)}
                {' · '}TP {fmt(s.takeProfit)}
                {s.riskReward != null ? ` · RR ${Number(s.riskReward).toFixed(2)}` : ''}
                {s.primaryStrategy ? ` · ${String(s.primaryStrategy)}` : ''}
                {appearedAt ? ` · ${formatRelativeTime(appearedAt)}` : ''}
              </Typography>
              <CandleChart
                symbol={String(s.symbol)}
                interval={timeframe || '1h'}
                height={280}
                entry={Number(s.entry)}
                stopLoss={s.stopLoss != null ? Number(s.stopLoss) : undefined}
                takeProfit={s.takeProfit != null ? Number(s.takeProfit) : undefined}
              />
            </Box>
          );
        }}
        columns={[
          { key: 'symbol', header: 'Symbol', render: (s) => <Typography sx={monoSx}>{String(s.symbol)}</Typography> },
          { key: 'side', header: 'Side', render: (s) => <SideChip side={String(s.side)} /> },
          {
            key: 'timing',
            header: 'Timing',
            render: (s) => <EntryTimingChip entryTiming={s.entryTiming} strategyIds={s.strategyIds} />,
          },
          { key: 'tf', header: 'TF', render: (s) => String(s.timeframe ?? '—') },
          {
            key: 'appeared',
            header: 'Appeared',
            render: (s) => {
              const appearedAt = s.createdAt as string | undefined;
              return <span title={formatDateTime(appearedAt)}>{formatRelativeTime(appearedAt)}</span>;
            },
          },
          { key: 'conf', header: 'Confidence', numeric: true, render: (s) => `${Number(s.confidence).toFixed(1)}%` },
          { key: 'loc', header: 'Location', render: (s) => formatLocation(s.locations) },
          { key: 'rs', header: 'RS', numeric: true, render: (s) => formatRelativeStrength(s.relativeStrength) },
          { key: 'entry', header: 'Entry', numeric: true, render: (s) => formatPrice(Number(s.entry)) },
          { key: 'status', header: 'Status', render: (s) => <StatusChip status={String(s.status)} /> },
          { key: 'strategy', header: 'Strategy', render: (s) => String(s.primaryStrategy) },
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (s) => {
              const id = String(s._id);
              const chartOpen = chartSignalId === id;
              return (
                <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Button
                    size="sm"
                    variant={chartOpen ? 'solid' : 'outlined'}
                    color="neutral"
                    onClick={() => setChartSignalId(chartOpen ? null : id)}
                  >
                    Chart
                  </Button>
                  {listMode === 'ranked' && (s.status === 'ranked' || s.status === 'watching') && (
                    <>
                      {s.status === 'ranked' && (
                        <Button
                          size="sm"
                          color="success"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(id)}
                        >
                          Approve
                        </Button>
                      )}
                      <Button size="sm" color="warning" variant="outlined" onClick={() => reject.mutate(id)}>
                        Reject
                      </Button>
                    </>
                  )}
                </Box>
              );
            },
          },
        ]}
      />
    </Box>
  );
}
