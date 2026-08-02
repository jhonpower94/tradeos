import { useEffect, useRef, useState } from 'react';
import { Box, MenuItem, Paper, TextField, Typography } from '@mui/material';
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { marketApi } from '../api';

export function ChartsPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIntervalTf] = useState('15m');
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const { data } = useQuery({
    queryKey: ['candles', symbol, interval],
    queryFn: () => marketApi.candles(symbol, interval, 300),
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0E141C' },
        textColor: '#8598AC',
      },
      grid: {
        vertLines: { color: 'rgba(148,168,190,0.08)' },
        horzLines: { color: 'rgba(148,168,190,0.08)' },
      },
      width: containerRef.current.clientWidth,
      height: 520,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#2DD4A7',
      downColor: '#FF6B5E',
      borderVisible: false,
      wickUpColor: '#2DD4A7',
      wickDownColor: '#FF6B5E',
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !data?.candles) return;
    seriesRef.current.setData(
      data.candles.map((c: { openTime: number; open: number; high: number; low: number; close: number }) => ({
        time: Math.floor(c.openTime / 1000) as unknown as import('lightweight-charts').UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Charts
      </Typography>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2 }}>
        <TextField label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
        <TextField select label="Interval" value={interval} onChange={(e) => setIntervalTf(e.target.value)} sx={{ width: 120 }}>
          {['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>
      </Paper>
      <Paper sx={{ p: 1 }}>
        <div ref={containerRef} />
      </Paper>
    </Box>
  );
}
