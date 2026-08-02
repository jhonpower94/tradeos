import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { journalApi } from '../api';

export function JournalPage() {
  const { data } = useQuery({ queryKey: ['journal'], queryFn: journalApi.list });

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Journal
      </Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Symbol</TableCell>
              <TableCell>Side</TableCell>
              <TableCell>Strategy</TableCell>
              <TableCell>Entry</TableCell>
              <TableCell>Exit</TableCell>
              <TableCell>PnL</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Entry reason</TableCell>
              <TableCell>Exit reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.items ?? []).map((j: Record<string, unknown>) => (
              <TableRow key={String(j._id)}>
                <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{String(j.symbol)}</TableCell>
                <TableCell>{String(j.side)}</TableCell>
                <TableCell>{String(j.strategy ?? '—')}</TableCell>
                <TableCell>{Number(j.entry ?? 0).toPrecision(6)}</TableCell>
                <TableCell>{Number(j.exit ?? 0).toPrecision(6)}</TableCell>
                <TableCell sx={{ color: Number(j.pnl) >= 0 ? 'long.main' : 'short.main' }}>
                  {Number(j.pnl ?? 0).toFixed(2)}
                </TableCell>
                <TableCell>{j.confidence != null ? `${Number(j.confidence).toFixed(0)}%` : '—'}</TableCell>
                <TableCell>{String(j.entryReason ?? '—')}</TableCell>
                <TableCell>{String(j.exitReason ?? '—')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
