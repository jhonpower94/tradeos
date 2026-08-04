import { Fragment, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { signalsApi } from '../api';
import { CandleChart } from '../components/CandleChart';
import { formatDateTime, formatRelativeTime } from '../utils/format';

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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4">Signals</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {view === 'ranked'
              ? 'Active ranked opportunities — same board as Scanner. Approve here to trade.'
              : 'Past signals (executed, rejected, expired).'}
          </Typography>
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, v) => {
            if (v) {
              setView(v);
              setChartSignalId(null);
            }
          }}
        >
          <ToggleButton value="ranked">Active</ToggleButton>
          <ToggleButton value="history">History</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {approve.isError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => approve.reset()}>
          {mutationErrorMessage(approve.error)}
        </Alert>
      )}
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Symbol</TableCell>
              <TableCell>Side</TableCell>
              <TableCell>TF</TableCell>
              <TableCell>Appeared</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Entry</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Strategy</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.items ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography variant="body2" color="text.secondary">
                    {view === 'ranked' ? 'No active ranked signals right now.' : 'No signal history yet.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {(data?.items ?? []).map((s: Record<string, unknown>) => {
              const id = String(s._id);
              const chartOpen = chartSignalId === id;
              const timeframe = String(s.timeframe ?? '1h');
              const appearedAt = (s.updatedAt ?? s.createdAt) as string | undefined;
              return (
                <Fragment key={id}>
                  <TableRow>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{String(s.symbol)}</TableCell>
                    <TableCell sx={{ color: s.side === 'BUY' ? 'long.main' : 'short.main' }}>
                      {String(s.side)}
                    </TableCell>
                    <TableCell>{String(s.timeframe ?? '—')}</TableCell>
                    <TableCell
                      title={formatDateTime(appearedAt)}
                      sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
                    >
                      {formatRelativeTime(appearedAt)}
                    </TableCell>
                    <TableCell>{Number(s.confidence).toFixed(1)}%</TableCell>
                    <TableCell>{Number(s.entry).toPrecision(6)}</TableCell>
                    <TableCell>{String(s.status)}</TableCell>
                    <TableCell>{String(s.primaryStrategy)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <ToggleButton
                        size="small"
                        value="chart"
                        selected={chartOpen}
                        onChange={() => setChartSignalId(chartOpen ? null : id)}
                        sx={{
                          mr: 1,
                          px: 1.25,
                          py: 0.25,
                          textTransform: 'none',
                          fontSize: '0.8125rem',
                          lineHeight: 1.5,
                        }}
                      >
                        Chart
                      </ToggleButton>
                      {s.status === 'ranked' && view === 'ranked' && (
                        <>
                          <Button size="small" onClick={() => approve.mutate(id)}>
                            Approve
                          </Button>
                          <Button size="small" color="warning" onClick={() => reject.mutate(id)}>
                            Reject
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                  {chartOpen && (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ bgcolor: 'background.default', py: 2 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            mb: 1.5,
                            fontFamily: 'IBM Plex Mono, monospace',
                            color: 'text.secondary',
                          }}
                        >
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
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
