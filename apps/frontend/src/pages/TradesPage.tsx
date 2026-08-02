import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { positionsApi, tradesApi } from '../api';
import { BiasChip } from '../components/BiasChip';

type PositionContext = {
  tradeId: string;
  aligned: boolean;
  suggestion: string;
  message: string;
};

export function TradesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['trades'], queryFn: tradesApi.list, refetchInterval: 10_000 });
  const { data: contexts } = useQuery({
    queryKey: ['positions-context'],
    queryFn: positionsApi.context,
    refetchInterval: 30_000,
  });
  const contextByTrade = new Map<string, PositionContext>(
    ((contexts?.items ?? []) as PositionContext[]).map((c) => [c.tradeId, c]),
  );
  const close = useMutation({
    mutationFn: (id: string) => tradesApi.close(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['positions'] });
      qc.invalidateQueries({ queryKey: ['positions-context'] });
    },
  });

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Trades
      </Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Symbol</TableCell>
              <TableCell>Side</TableCell>
              <TableCell>Mode</TableCell>
              <TableCell>Qty</TableCell>
              <TableCell>Entry</TableCell>
              <TableCell>Exit</TableCell>
              <TableCell>PnL</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Bias</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.items ?? []).map((t: Record<string, unknown>) => {
              const ctx = t.status === 'open' ? contextByTrade.get(String(t._id)) : undefined;
              return (
                <TableRow key={String(t._id)}>
                  <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{String(t.symbol)}</TableCell>
                  <TableCell>{String(t.side)}</TableCell>
                  <TableCell>{String(t.mode)}</TableCell>
                  <TableCell>{Number(t.qty).toPrecision(6)}</TableCell>
                  <TableCell>{Number(t.entryPrice ?? 0).toPrecision(6)}</TableCell>
                  <TableCell>{t.exitPrice ? Number(t.exitPrice).toPrecision(6) : '—'}</TableCell>
                  <TableCell sx={{ color: Number(t.realizedPnl) >= 0 ? 'long.main' : 'short.main' }}>
                    {Number(t.realizedPnl ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell>{String(t.status)}</TableCell>
                  <TableCell>
                    {ctx ? (
                      <BiasChip
                        aligned={ctx.aligned}
                        suggestion={ctx.suggestion}
                        message={ctx.message}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {t.status === 'open' && (
                      <Button size="small" color="warning" onClick={() => close.mutate(String(t._id))}>
                        Close
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
