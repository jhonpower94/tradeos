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
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { portfolioApi, positionsApi } from '../api';

function errMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

export function PortfolioPage() {
  const qc = useQueryClient();
  const { data: summary } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.summary,
    refetchInterval: 5_000,
  });
  const { data: positions } = useQuery({
    queryKey: ['positions'],
    queryFn: positionsApi.list,
    refetchInterval: 5_000,
  });
  const { data: ledger } = useQuery({
    queryKey: ['paper-ledger'],
    queryFn: portfolioApi.ledger,
    enabled: summary?.mode === 'paper',
  });

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const deposit = useMutation({
    mutationFn: () => portfolioApi.deposit(Number(amount), note || undefined),
    onSuccess: () => {
      setAmount('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['paper-ledger'] });
    },
  });
  const withdraw = useMutation({
    mutationFn: () => portfolioApi.withdraw(Number(amount), note || undefined),
    onSuccess: () => {
      setAmount('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['paper-ledger'] });
    },
  });

  const isPaper = summary?.mode === 'paper';
  const fundError = deposit.error ?? withdraw.error;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Portfolio
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, mb: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2">Equity</Typography>
          <Typography variant="h4" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
            {(summary?.equity ?? 0).toFixed(2)}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2">Free USDT</Typography>
          <Typography variant="h4" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
            {(summary?.freeQuote ?? summary?.balances?.[0]?.free ?? 0).toFixed(2)}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2">Unrealized PnL</Typography>
          <Typography
            variant="h4"
            sx={{
              fontFamily: 'IBM Plex Mono, monospace',
              color: (summary?.unrealizedPnl ?? 0) >= 0 ? 'long.main' : 'short.main',
            }}
          >
            {(summary?.unrealizedPnl ?? 0).toFixed(2)}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2">Realized PnL</Typography>
          <Typography
            variant="h4"
            sx={{
              fontFamily: 'IBM Plex Mono, monospace',
              color: (summary?.realizedPnl ?? 0) >= 0 ? 'long.main' : 'short.main',
            }}
          >
            {(summary?.realizedPnl ?? 0).toFixed(2)}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2">Starting balance</Typography>
          <Typography variant="h4" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
            {(summary?.startingBalance ?? 0).toFixed(2)}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2">Mode</Typography>
          <Typography variant="h4">{summary?.mode ?? 'paper'}</Typography>
        </Paper>
      </Box>

      {isPaper && (
        <Paper sx={{ p: 2, mb: 3, display: 'grid', gap: 2, maxWidth: 520 }}>
          <Typography variant="h6">Fund paper account</Typography>
          <Typography variant="body2" color="text.secondary">
            Deposits and withdrawals adjust equity on top of starting balance and realized trade PnL.
          </Typography>
          {fundError && (
            <Alert severity="error" onClose={() => { deposit.reset(); withdraw.reset(); }}>
              {errMsg(fundError)}
            </Alert>
          )}
          <TextField
            label="Amount (USDT)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              disabled={!Number(amount) || deposit.isPending}
              onClick={() => deposit.mutate()}
            >
              Deposit
            </Button>
            <Button
              variant="outlined"
              color="warning"
              disabled={!Number(amount) || withdraw.isPending}
              onClick={() => withdraw.mutate()}
            >
              Withdraw
            </Button>
          </Box>
        </Paper>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        Balances
      </Typography>
      <Paper sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Asset</TableCell>
              <TableCell>Free</TableCell>
              <TableCell>Locked / Deployed</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(summary?.balances ?? []).map((b: { asset: string; free: number; locked: number }) => (
              <TableRow key={b.asset}>
                <TableCell>{b.asset}</TableCell>
                <TableCell>{b.free.toFixed(4)}</TableCell>
                <TableCell>{b.locked.toFixed(4)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {isPaper && (
        <>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Funding ledger
          </Typography>
          <Paper sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Note</TableCell>
                  <TableCell>When</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(ledger?.items ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        No deposits or withdrawals yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {(ledger?.items ?? []).map((e: Record<string, unknown>) => (
                  <TableRow key={String(e._id)}>
                    <TableCell>{String(e.type)}</TableCell>
                    <TableCell>{Number(e.amount).toFixed(2)}</TableCell>
                    <TableCell>{String(e.note ?? '—')}</TableCell>
                    <TableCell>
                      {e.createdAt ? new Date(String(e.createdAt)).toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        Open Positions
      </Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Symbol</TableCell>
              <TableCell>Side</TableCell>
              <TableCell>Qty</TableCell>
              <TableCell>Entry</TableCell>
              <TableCell>Mark</TableCell>
              <TableCell>uPnL</TableCell>
              <TableCell>SL</TableCell>
              <TableCell>TP</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(positions?.items ?? [])
              .filter((p: { status: string }) => p.status === 'open')
              .map((p: Record<string, unknown>) => (
                <TableRow key={String(p._id)}>
                  <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{String(p.symbol)}</TableCell>
                  <TableCell>{String(p.side)}</TableCell>
                  <TableCell>{Number(p.qty).toPrecision(6)}</TableCell>
                  <TableCell>{Number(p.entryPrice).toPrecision(6)}</TableCell>
                  <TableCell>{Number(p.currentPrice).toPrecision(6)}</TableCell>
                  <TableCell sx={{ color: Number(p.unrealizedPnl) >= 0 ? 'long.main' : 'short.main' }}>
                    {Number(p.unrealizedPnl).toFixed(2)}
                  </TableCell>
                  <TableCell>{p.stopLoss ? Number(p.stopLoss).toPrecision(6) : '—'}</TableCell>
                  <TableCell>{p.takeProfit ? Number(p.takeProfit).toPrecision(6) : '—'}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
