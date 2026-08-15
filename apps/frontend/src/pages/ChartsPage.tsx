import { useEffect, useState } from 'react';
import Box from '@mui/joy/Box';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import { CandleChart } from '../components/CandleChart';
import { PageHeader } from '../components/PageHeader';

export function ChartsPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIntervalTf] = useState('15m');
  const [chartHeight, setChartHeight] = useState(520);

  useEffect(() => {
    const apply = () => setChartHeight(Math.min(Math.round(window.innerHeight * 0.52), 520));
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  return (
    <Box>
      <PageHeader title="Charts" subtitle="Spot candles" />
      <Sheet
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          display: 'flex',
          gap: 2,
          flexDirection: { xs: 'column', sm: 'row' },
          borderRadius: 'md',
        }}
      >
        <FormControl sx={{ flex: { sm: 1 }, maxWidth: { sm: 240 } }}>
          <FormLabel>Symbol</FormLabel>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
        </FormControl>
        <FormControl sx={{ minWidth: { sm: 140 } }}>
          <FormLabel>Interval</FormLabel>
          <Select value={interval} onChange={(_, v) => v && setIntervalTf(v)}>
            {['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((t) => (
              <Option key={t} value={t}>
                {t}
              </Option>
            ))}
          </Select>
        </FormControl>
      </Sheet>
      <Sheet variant="outlined" sx={{ p: 1, borderRadius: 'md' }}>
        <CandleChart symbol={symbol} interval={interval} height={chartHeight} showHeader={false} />
      </Sheet>
    </Box>
  );
}
