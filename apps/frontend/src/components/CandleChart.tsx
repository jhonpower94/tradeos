import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  CandlestickSeries,
} from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { marketApi } from '../api';

export type CandleChartProps = {
  symbol: string;
  interval: string;
  height?: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  showHeader?: boolean;
  limit?: number;
};

function priceFormatFor(sample: number): { type: 'price'; precision: number; minMove: number } {
  if (!(sample > 0)) return { type: 'price', precision: 2, minMove: 0.01 };
  if (sample >= 1000) return { type: 'price', precision: 2, minMove: 0.01 };
  if (sample >= 1) return { type: 'price', precision: 4, minMove: 0.0001 };
  if (sample >= 0.01) return { type: 'price', precision: 6, minMove: 0.000001 };
  return { type: 'price', precision: 8, minMove: 0.00000001 };
}

export function CandleChart({
  symbol,
  interval,
  height = 280,
  entry,
  stopLoss,
  takeProfit,
  showHeader = true,
  limit = 300,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  const { data, isError, isLoading } = useQuery({
    queryKey: ['candles', symbol, interval, limit],
    queryFn: () => marketApi.candles(symbol, interval, limit),
    enabled: Boolean(symbol && interval),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: '#0E141C' },
        textColor: '#C5D0DC',
      },
      grid: {
        vertLines: { color: 'rgba(148,168,190,0.08)' },
        horzLines: { color: 'rgba(148,168,190,0.08)' },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: 'rgba(148,168,190,0.35)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: true,
        borderColor: 'rgba(148,168,190,0.35)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelVisible: true },
        horzLine: { labelVisible: true },
      },
      width: Math.max(el.clientWidth, 1),
      height,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#2DD4A7',
      downColor: '#FF6B5E',
      borderVisible: false,
      wickUpColor: '#2DD4A7',
      wickDownColor: '#FF6B5E',
      lastValueVisible: true,
      priceLineVisible: true,
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const applyWidth = () => {
      const w = el.clientWidth;
      if (w > 0) {
        chart.applyOptions({ width: w });
      }
    };

    applyWidth();
    const ro = new ResizeObserver(() => {
      applyWidth();
    });
    ro.observe(el);
    // Table expand can paint width on next frames
    const raf = requestAnimationFrame(applyWidth);
    const t = window.setTimeout(applyWidth, 50);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro.disconnect();
      linesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, symbol, interval]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !data?.candles?.length) return;

    const candles = data.candles as {
      openTime: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }[];
    const lastClose = candles[candles.length - 1]?.close ?? 0;
    series.applyOptions({ priceFormat: priceFormatFor(lastClose) });

    series.setData(
      candles.map((c) => ({
        time: Math.floor(c.openTime / 1000) as unknown as import('lightweight-charts').UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const el = containerRef.current;
    if (el && el.clientWidth > 0) {
      chart.applyOptions({ width: el.clientWidth });
      chart.timeScale().fitContent();
    } else {
      requestAnimationFrame(() => {
        if (containerRef.current && chartRef.current) {
          const w = containerRef.current.clientWidth;
          if (w > 0) {
            chartRef.current.applyOptions({ width: w });
            chartRef.current.timeScale().fitContent();
          }
        }
      });
    }
  }, [data]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of linesRef.current) {
      series.removePriceLine(line);
    }
    linesRef.current = [];
    const add = (price: number | undefined, color: string, title: string) => {
      if (price == null || !(price > 0)) return;
      linesRef.current.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title,
        }),
      );
    };
    add(entry, '#8598AC', 'Entry');
    add(stopLoss, '#FF6B5E', 'SL');
    add(takeProfit, '#2DD4A7', 'TP');
  }, [entry, stopLoss, takeProfit, data]);

  return (
    <Box sx={{ width: '100%' }}>
      {showHeader && (
        <Typography
          variant="subtitle2"
          sx={{ mb: 1, fontFamily: 'IBM Plex Mono, monospace', color: 'text.secondary' }}
        >
          {symbol} · {interval}
          {isLoading ? ' · loading…' : ''}
          {isError ? ' · failed to load candles' : ''}
        </Typography>
      )}
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          minHeight: height,
          overflow: 'hidden',
        }}
      />
    </Box>
  );
}
