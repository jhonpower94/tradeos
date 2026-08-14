import { useEffect, useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import IconButton from '@mui/joy/IconButton';
import ToggleButtonGroup from '@mui/joy/ToggleButtonGroup';
import Typography from '@mui/joy/Typography';
import Close from '@mui/icons-material/Close';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { signalsApi } from '../api';
import { CandleChart } from '../components/CandleChart';
import { PageHeader } from '../components/PageHeader';
import { SideChip } from '../components/SideChip';
import { StatusChip } from '../components/StatusChip';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatDateTime, formatPrice, formatRelativeTime } from '../utils/format';
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
  const [view, setView] = useState<'ranked' | 'history'>('ranked');
  const [chartSignalId, setChartSignalId] = useState<string | null>(null);
  const [, setNowTick] = useState(() => Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const { data } = useQuery({
    queryKey: ['signals', view],
    queryFn: () => signalsApi.list({ view }),
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

  const rows = (data?.items ?? []) as Array<Record<string, unknown>>;

  return (
    <Box>
      <PageHeader
        title="Signals"
        subtitle={
          view === 'ranked'
            ? 'Active ranked opportunities — same board as Scanner. Approve here to trade.'
            : 'Past signals (executed, rejected, expired).'
        }
        actions={
          <ToggleButtonGroup
            size="sm"
            value={view}
            onChange={(_, v) => {
              if (v) {
                setView(v);
                setChartSignalId(null);
              }
            }}
          >
            <Button value="ranked">Active</Button>
            <Button value="history">History</Button>
          </ToggleButtonGroup>
        }
      />
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
        rows={rows}
        getRowKey={(s) => String(s._id)}
        emptyTitle={view === 'ranked' ? 'No active ranked signals right now.' : 'No signal history yet.'}
        cardTitle={(s) => (
          <Typography level="title-md" sx={monoSx}>
            {String(s.symbol)}
          </Typography>
        )}
        cardMeta={(s) => (
          <>
            <SideChip side={String(s.side)} />
            <StatusChip status={String(s.status)} />
          </>
        )}
        cardFields={[
          { label: 'TF', render: (s) => String(s.timeframe ?? '—') },
          { label: 'Appeared', render: (s) => formatRelativeTime((s.updatedAt ?? s.createdAt) as string) },
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
              {s.status === 'ranked' && view === 'ranked' && (
                <>
                  <Button color="success" onClick={() => approve.mutate(id)}>
                    Approve
                  </Button>
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
          const appearedAt = (s.updatedAt ?? s.createdAt) as string | undefined;
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
          { key: 'tf', header: 'TF', render: (s) => String(s.timeframe ?? '—') },
          {
            key: 'appeared',
            header: 'Appeared',
            render: (s) => {
              const appearedAt = (s.updatedAt ?? s.createdAt) as string | undefined;
              return <span title={formatDateTime(appearedAt)}>{formatRelativeTime(appearedAt)}</span>;
            },
          },
          { key: 'conf', header: 'Confidence', numeric: true, render: (s) => `${Number(s.confidence).toFixed(1)}%` },
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
                  {s.status === 'ranked' && view === 'ranked' && (
                    <>
                      <Button size="sm" color="success" onClick={() => approve.mutate(id)}>
                        Approve
                      </Button>
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
