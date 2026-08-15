import { useEffect, useRef } from 'react';
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useColorScheme } from '@mui/joy/styles';
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
import { monoSx } from '../theme/theme';

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

function chartColors(isDark: boolean) {
  return isDark
    ? {
        bg: '#121A24',
        text: '#8B9BB0',
        grid: 'rgba(148,168,190,0.1)',
        border: 'rgba(148,168,190,0.28)',
        up: '#22A86C',
        down: '#E5484D',
        entry: '#8B9BB0',
      }
    : {
        bg: '#FFFFFF',
        text: '#5B6B7C',
        grid: 'rgba(16,32,51,0.06)',
        border: 'rgba(16,32,51,0.14)',
        up: '#0D9F6E',
        down: '#E5484D',
        entry: '#5B6B7C',
      };
}

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
  const { mode, systemMode } = useColorScheme();
  const isDark = (mode === 'system' ? systemMode : mode) === 'dark';
  const colors = chartColors(isDark);

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
        background: { color: colors.bg },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: colors.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: true,
        borderColor: colors.border,
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
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
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
  }, [height, symbol, interval, isDark]);

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
  }, [data, isDark]);

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
    add(entry, colors.entry, 'Entry');
    add(stopLoss, colors.down, 'SL');
    add(takeProfit, colors.up, 'TP');
  }, [entry, stopLoss, takeProfit, data, colors.entry, colors.down, colors.up]);

  return (
    <Box sx={{ width: '100%' }}>
      {showHeader && (
        <Typography level="body-xs" sx={{ mb: 1, ...monoSx, color: 'text.secondary' }}>
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
          borderRadius: 'sm',
        }}
      />
    </Box>
  );
}
