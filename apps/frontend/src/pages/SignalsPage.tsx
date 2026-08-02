import { useState } from 'react';
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

function mutationErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

export function SignalsPage() {
  const [view, setView] = useState<'ranked' | 'history'>('ranked');
  const qc = useQueryClient();
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
            if (v) setView(v);
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
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary">
                    {view === 'ranked' ? 'No active ranked signals right now.' : 'No signal history yet.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {(data?.items ?? []).map((s: Record<string, unknown>) => (
              <TableRow key={String(s._id)}>
                <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{String(s.symbol)}</TableCell>
                <TableCell sx={{ color: s.side === 'BUY' ? 'long.main' : 'short.main' }}>{String(s.side)}</TableCell>
                <TableCell>{String(s.timeframe ?? '—')}</TableCell>
                <TableCell>{Number(s.confidence).toFixed(1)}%</TableCell>
                <TableCell>{Number(s.entry).toPrecision(6)}</TableCell>
                <TableCell>{String(s.status)}</TableCell>
                <TableCell>{String(s.primaryStrategy)}</TableCell>
                <TableCell align="right">
                  {s.status === 'ranked' && view === 'ranked' && (
                    <>
                      <Button size="small" onClick={() => approve.mutate(String(s._id))}>
                        Approve
                      </Button>
                      <Button size="small" color="warning" onClick={() => reject.mutate(String(s._id))}>
                        Reject
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
