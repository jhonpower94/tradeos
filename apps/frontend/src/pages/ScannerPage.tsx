import { useState } from 'react';
import {
  Box,
  Button,
  MenuItem,
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
import { scannerApi } from '../api';
import { useLiveStore } from '../stores/liveStore';
import { RegimeChip } from '../components/RegimeChip';

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

  const items = ((live.length ? live : data?.items ?? []) as Array<Record<string, unknown>>).filter(
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Box>
          <Typography variant="h4">Scanner</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Scanner runs on the server and continues even if you close the browser.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
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
        </Box>
      </Box>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Min confidence"
          type="number"
          value={minConfidence}
          onChange={(e) => setMinConfidence(Number(e.target.value))}
          sx={{ width: 140 }}
        />
        <TextField
          select
          label="Timeframe"
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          sx={{ width: 120 }}
        >
          <MenuItem value="">All</MenuItem>
          {['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Side"
          value={side}
          onChange={(e) => setSide(e.target.value)}
          sx={{ width: 120 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="BUY">BUY</MenuItem>
          <MenuItem value="SELL">SELL</MenuItem>
        </TextField>
        <TextField
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 160 }}
        />
        <Typography variant="body2" sx={{ alignSelf: 'center' }}>
          Scanned: {status?.pairsScanned ?? 0} · Found: {status?.opportunitiesFound ?? 0}
        </Typography>
      </Paper>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Rank</TableCell>
              <TableCell>Pair</TableCell>
              <TableCell>Side</TableCell>
              <TableCell>Regime</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Entry</TableCell>
              <TableCell>SL</TableCell>
              <TableCell>TP</TableCell>
              <TableCell>RR</TableCell>
              <TableCell>Strategy</TableCell>
              <TableCell>TF</TableCell>
              <TableCell>Duration</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((o: Record<string, unknown>, i: number) => (
              <TableRow key={String(o._id ?? `${o.symbol}-${o.timeframe}-${i}`)}>
                <TableCell>{Number(o.rank ?? i + 1)}</TableCell>
                <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{String(o.symbol)}</TableCell>
                <TableCell sx={{ color: o.side === 'BUY' ? 'long.main' : 'short.main' }}>
                  {String(o.side)}
                </TableCell>
                <TableCell>{o.regime ? <RegimeChip regime={String(o.regime)} /> : '—'}</TableCell>
                <TableCell>{Number(o.confidence).toFixed(1)}%</TableCell>
                <TableCell>{Number(o.entry).toPrecision(6)}</TableCell>
                <TableCell>{Number(o.stopLoss).toPrecision(6)}</TableCell>
                <TableCell>{Number(o.takeProfit).toPrecision(6)}</TableCell>
                <TableCell>{Number(o.riskReward).toFixed(2)}</TableCell>
                <TableCell>{String(o.primaryStrategy)}</TableCell>
                <TableCell>{String(o.timeframe)}</TableCell>
                <TableCell>{String(o.estimatedDuration ?? '—')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
