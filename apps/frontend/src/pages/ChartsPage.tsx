import { useState } from 'react';
import { Box, MenuItem, Paper, TextField, Typography } from '@mui/material';
import { CandleChart } from '../components/CandleChart';

export function ChartsPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIntervalTf] = useState('15m');

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Charts
      </Typography>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2 }}>
        <TextField
          label="Symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        />
        <TextField
          select
          label="Interval"
          value={interval}
          onChange={(e) => setIntervalTf(e.target.value)}
          sx={{ width: 120 }}
        >
          {['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
      </Paper>
      <Paper sx={{ p: 1 }}>
        <CandleChart symbol={symbol} interval={interval} height={520} showHeader={false} />
      </Paper>
    </Box>
  );
}
