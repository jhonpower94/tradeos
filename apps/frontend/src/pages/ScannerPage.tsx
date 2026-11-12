import { useMemo, useState } from 'react';
import Autocomplete from '@mui/joy/Autocomplete';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { scannerApi } from '../api';
import { useLiveStore } from '../stores/liveStore';
import { RegimeChip } from '../components/RegimeChip';
import { SideChip } from '../components/SideChip';
import { EntryTimingChip } from '../components/EntryTimingChip';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { PageHeader } from '../components/PageHeader';
import { ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatDateTime, formatLocation, formatPrice, formatRelativeStrength, formatRelativeTime } from '../utils/format';
import { isWatchingRow, sortTriggeredThenNewest } from '../utils/sort';
import { StatusChip } from '../components/StatusChip';
import { monoSx } from '../theme/theme';

/** Normalize typed pair input the same way the API does (gram → GRAMUSDT). */
function normalizeUsdtSymbolInput(raw: string): string {
  let s = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  if (!s.endsWith('USDT')) s = `${s}USDT`;
  return s;
}

function filterSymbolOptions(symbols: string[], input: string, limit = 20): string[] {
  const q = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!q) return symbols.slice(0, limit);
  const withUsdt = q.endsWith('USDT') ? q : `${q}USDT`;
  const matched = symbols.filter(
    (s) => s.includes(q) || s === withUsdt || s.startsWith(q) || s.replace(/USDT$/, '').includes(q),
  );
  // Prefer exact / prefix hits first.
  matched.sort((a, b) => {
    const aExact = a === withUsdt || a === q ? 0 : a.startsWith(withUsdt) || a.startsWith(q) ? 1 : 2;
    const bExact = b === withUsdt || b === q ? 0 : b.startsWith(withUsdt) || b.startsWith(q) ? 1 : 2;
    if (aExact !== bExact) return aExact - bExact;
    return a.localeCompare(b);
  });
  return matched.slice(0, limit);
}

type SizePreview = {
  ok?: boolean;
  notional?: number;
  riskAmount?: number;
  effectiveRiskAtStop?: number;
  minNotionalFloored?: boolean;
  reasons?: string[];
};

function getSizePreview(row: Record<string, unknown>): SizePreview | undefined {
  const p = row.sizePreview;
  if (!p || typeof p !== 'object') return undefined;
  return p as SizePreview;
}

function formatSizePreview(preview: SizePreview | undefined): string {
  if (preview?.notional == null || !Number.isFinite(preview.notional)) return '—';
  const notional = `$${preview.notional.toFixed(0)}`;
  const eff = preview.effectiveRiskAtStop;
  const target = preview.riskAmount;
  const showRisk =
    eff != null &&
    Number.isFinite(eff) &&
    (preview.minNotionalFloored || (target != null && eff > target * 1.001));
  if (!showRisk) return notional;
  return `${notional} · risk ~$${eff.toFixed(0)}`;
}

function errMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'Rescan failed';
}

export function ScannerPage() {
  const [minConfidence, setMinConfidence] = useState(75);
  const [timeframe, setTimeframe] = useState('');
  const [side, setSide] = useState('');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [rescanSymbol, setRescanSymbol] = useState('');
  const [rescanInfo, setRescanInfo] = useState<string | null>(null);
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
  const { data: symbolsData, isLoading: symbolsLoading } = useQuery({
    queryKey: ['scanner-symbols'],
    queryFn: scannerApi.symbols,
    staleTime: 60 * 60 * 1000,
  });
  const eligibleSymbols = useMemo(
    () => (Array.isArray(symbolsData?.symbols) ? (symbolsData.symbols as string[]) : []),
    [symbolsData],
  );
  const symbolSet = useMemo(() => new Set(eligibleSymbols), [eligibleSymbols]);
  const normalizedRescan = normalizeUsdtSymbolInput(rescanSymbol);
  const rescanKnown = Boolean(normalizedRescan && symbolSet.has(normalizedRescan));
  const rescanMatches = useMemo(
    () => filterSymbolOptions(eligibleSymbols, rescanSymbol),
    [eligibleSymbols, rescanSymbol],
  );
  const showNoMatchHint =
    rescanSymbol.trim().length > 0 && !rescanKnown && rescanMatches.length === 0 && !symbolsLoading;

  const start = useMutation({
    mutationFn: scannerApi.start,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanner-status'] }),
  });
  const stop = useMutation({
    mutationFn: scannerApi.stop,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanner-status'] }),
  });
  const rescan = useMutation({
    mutationFn: (symbol: string) => scannerApi.rescan(symbol),
    onSuccess: (res: {
      symbol?: string;
      opportunities?: unknown[];
      autoExecutedEligible?: boolean;
    }) => {
      const symbol = res.symbol ?? normalizedRescan;
      const n = Array.isArray(res.opportunities) ? res.opportunities.length : 0;
      setRescanInfo(
        n > 0
          ? `${symbol}: ${n} opportunit${n === 1 ? 'y' : 'ies'}${
              res.autoExecutedEligible === false ? ' (open position — not auto-traded)' : ''
            }`
          : `${symbol}: No active strategies`,
      );
      void qc.invalidateQueries({ queryKey: ['opportunities'] });
      void qc.invalidateQueries({ queryKey: ['signals'] });
      void qc.invalidateQueries({ queryKey: ['scanner-status'] });
    },
    onError: (err) => {
      setRescanInfo(errMsg(err));
    },
  });

  const runRescan = () => {
    if (!rescanKnown || rescan.isPending) return;
    rescan.mutate(normalizedRescan);
  };

  const items = sortTriggeredThenNewest(
    ((live.length ? live : (data?.items ?? [])) as Array<Record<string, unknown>>).filter(
      (o: Record<string, unknown>) => {
        if (!isWatchingRow(o) && Number(o.confidence) < minConfidence) return false;
        if (timeframe && o.timeframe !== timeframe) return false;
        if (side && o.side !== side) return false;
        if (search && !String(o.symbol).toLowerCase().includes(search.toLowerCase())) return false;
        if (stage === 'triggered' && isWatchingRow(o)) return false;
        if (stage === 'watching' && !isWatchingRow(o)) return false;
        return true;
      },
    ),
  );

  return (
    <Box>
      <PageHeader
        title="Scanner"
        subtitle="Starts scanning for your account on the server (other users are unaffected when you Stop)."
        actions={
          <>
            <Button
              variant="outlined"
              onClick={() => start.mutate()}
              disabled={status?.enabled === true}
              loading={start.isPending}
            >
              Start
            </Button>
            <Button
              variant="outlined"
              color="warning"
              onClick={() => stop.mutate()}
              disabled={status?.enabled === false}
              loading={stop.isPending}
            >
              Stop
            </Button>
          </>
        }
      />
      <Sheet
        variant="outlined"
        sx={{
          p: 2,
          mb: 1.5,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'minmax(0, 1fr) auto',
          },
          alignItems: 'end',
          borderRadius: 'md',
        }}
      >
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Rescan pair</FormLabel>
          <Autocomplete
            freeSolo
            options={eligibleSymbols}
            filterOptions={(options, state) => filterSymbolOptions(options, state.inputValue)}
            value={rescanSymbol || null}
            inputValue={rescanSymbol}
            onInputChange={(_, value) => {
              setRescanSymbol(value);
              if (rescanInfo) setRescanInfo(null);
              if (rescan.isError) rescan.reset();
            }}
            onChange={(_, value) => {
              const next = typeof value === 'string' ? value : value ?? '';
              setRescanSymbol(next);
              if (rescanInfo) setRescanInfo(null);
              if (rescan.isError) rescan.reset();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runRescan();
              }
            }}
            placeholder="BTCUSDT or gram"
            loading={symbolsLoading}
            slotProps={{
              input: { sx: { ...monoSx } },
              listbox: { sx: { ...monoSx, maxHeight: 280 } },
            }}
            sx={{ width: '100%' }}
            noOptionsText="No matching pairs"
          />
          {showNoMatchHint && (
            <FormHelperText sx={{ color: 'danger.500' }}>No matching pairs</FormHelperText>
          )}
          {rescanSymbol.trim() && !rescanKnown && rescanMatches.length > 0 && (
            <FormHelperText>Pick a pair from the list (or type the full symbol)</FormHelperText>
          )}
        </FormControl>
        <Button onClick={runRescan} disabled={!rescanKnown} loading={rescan.isPending}>
          Rescan
        </Button>
        {rescanInfo && (
          <Typography
            level="body-sm"
            color={rescan.isError ? 'danger' : 'neutral'}
            sx={{ gridColumn: '1 / -1' }}
          >
            {rescanInfo}
          </Typography>
        )}
      </Sheet>
      <Sheet
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr) minmax(0, 1fr)',
            md: 'repeat(5, minmax(0, 1fr)) auto',
          },
          alignItems: 'end',
          borderRadius: 'md',
        }}
      >
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Min confidence</FormLabel>
          <Input
            type="number"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            sx={{ width: '100%' }}
          />
        </FormControl>
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Timeframe</FormLabel>
          <Select
            value={timeframe}
            onChange={(_, v) => setTimeframe(v ?? '')}
            sx={{ minWidth: 0, width: '100%' }}
          >
            <Option value="">All</Option>
            {['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((t) => (
              <Option key={t} value={t}>
                {t}
              </Option>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Side</FormLabel>
          <Select
            value={side}
            onChange={(_, v) => setSide(v ?? '')}
            sx={{ minWidth: 0, width: '100%' }}
          >
            <Option value="">All</Option>
            <Option value="BUY">BUY</Option>
            <Option value="SELL">SELL</Option>
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 0 }}>
          <FormLabel>Stage</FormLabel>
          <Select
            value={stage}
            onChange={(_, v) => setStage(v ?? '')}
            sx={{ minWidth: 0, width: '100%' }}
          >
            <Option value="">All</Option>
            <Option value="triggered">Triggered</Option>
            <Option value="watching">Watching</Option>
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', md: 'auto' } }}>
          <FormLabel>Search</FormLabel>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pair"
            sx={{ width: '100%' }}
          />
        </FormControl>
        <Typography
          level="body-sm"
          sx={{
            color: 'text.secondary',
            gridColumn: { xs: '1 / -1', md: 'auto' },
            pb: { md: 0.75 },
          }}
        >
          Your scanner: {status?.enabled === false ? 'off' : 'on'}
          {status?.running ? ' · worker running' : ' · worker idle'} · Scanned:{' '}
          {status?.pairsScanned ?? 0} · Found: {status?.opportunitiesFound ?? 0}
        </Typography>
      </Sheet>
      <ResponsiveRecordList
        rows={items}
        getRowKey={(o) => String(o._id ?? `${o.symbol}-${o.timeframe}`)}
        emptyTitle="No opportunities match filters"
        cardTitle={(o) => (
          <Typography level="title-md" sx={monoSx}>
            {String(o.symbol)}
          </Typography>
        )}
        cardMeta={(o) => (
          <>
            <SideChip side={String(o.side)} />
            <StatusChip status={String(o.status ?? o.stage ?? 'ranked')} />
            <EntryTimingChip entryTiming={o.entryTiming} strategyIds={o.strategyIds} />
            {o.regime ? <RegimeChip regime={String(o.regime)} /> : null}
          </>
        )}
        cardFields={[
          { label: 'Appeared', render: (o) => formatRelativeTime(o.createdAt as string) },
          { label: 'Location', render: (o) => formatLocation(o.locations) },
          { label: 'RS', render: (o) => formatRelativeStrength(o.relativeStrength) },
          { label: 'Confidence', render: (o) => <ConfidenceBar value={Number(o.confidence)} /> },
          { label: 'RR', render: (o) => <Typography sx={monoSx}>{Number(o.riskReward).toFixed(2)}</Typography> },
          { label: 'Entry', render: (o) => <Typography sx={monoSx}>{formatPrice(Number(o.entry))}</Typography> },
          {
            label: 'Size',
            render: (o) => {
              const preview = getSizePreview(o);
              return (
                <Typography
                  sx={monoSx}
                  title={preview?.ok === false ? preview.reasons?.[0] : undefined}
                  color={preview?.ok === false ? 'warning' : undefined}
                >
                  {formatSizePreview(preview)}
                </Typography>
              );
            },
          },
          { label: 'SL', render: (o) => <Typography sx={monoSx}>{formatPrice(Number(o.stopLoss))}</Typography> },
          { label: 'TP', render: (o) => <Typography sx={monoSx}>{formatPrice(Number(o.takeProfit))}</Typography> },
          { label: 'TF', render: (o) => String(o.timeframe) },
          { label: 'Strategy', render: (o) => String(o.primaryStrategy) },
          { label: 'Duration', render: (o) => String(o.estimatedDuration ?? '—') },
        ]}
        columns={[
          { key: 'rank', header: '#', render: (o) => String(o.rank ?? '—') },
          { key: 'pair', header: 'Pair', render: (o) => <Typography sx={monoSx}>{String(o.symbol)}</Typography> },
          { key: 'status', header: 'Stage', render: (o) => <StatusChip status={String(o.status ?? o.stage ?? 'ranked')} /> },
          { key: 'side', header: 'Side', render: (o) => <SideChip side={String(o.side)} /> },
          {
            key: 'timing',
            header: 'Timing',
            render: (o) => <EntryTimingChip entryTiming={o.entryTiming} strategyIds={o.strategyIds} />,
          },
          {
            key: 'appeared',
            header: 'Appeared',
            render: (o) => {
              const appearedAt = o.createdAt as string | undefined;
              return <span title={formatDateTime(appearedAt)}>{formatRelativeTime(appearedAt)}</span>;
            },
          },
          { key: 'regime', header: 'Regime', render: (o) => (o.regime ? <RegimeChip regime={String(o.regime)} /> : '—') },
          { key: 'loc', header: 'Location', render: (o) => formatLocation(o.locations) },
          { key: 'rs', header: 'RS', numeric: true, render: (o) => formatRelativeStrength(o.relativeStrength) },
          { key: 'conf', header: 'Confidence', numeric: true, render: (o) => `${Number(o.confidence).toFixed(1)}%` },
          { key: 'entry', header: 'Entry', numeric: true, render: (o) => formatPrice(Number(o.entry)) },
          {
            key: 'size',
            header: 'Size',
            numeric: true,
            render: (o) => {
              const preview = getSizePreview(o);
              return (
                <Typography
                  component="span"
                  sx={monoSx}
                  title={preview?.ok === false ? preview.reasons?.[0] : undefined}
                  color={preview?.ok === false ? 'warning' : undefined}
                >
                  {formatSizePreview(preview)}
                </Typography>
              );
            },
          },
          { key: 'sl', header: 'SL', numeric: true, render: (o) => formatPrice(Number(o.stopLoss)) },
          { key: 'tp', header: 'TP', numeric: true, render: (o) => formatPrice(Number(o.takeProfit)) },
          { key: 'rr', header: 'RR', numeric: true, render: (o) => Number(o.riskReward).toFixed(2) },
          { key: 'strategy', header: 'Strategy', render: (o) => String(o.primaryStrategy) },
          { key: 'tf', header: 'TF', render: (o) => String(o.timeframe) },
          { key: 'dur', header: 'Duration', render: (o) => String(o.estimatedDuration ?? '—') },
        ]}
      />
    </Box>
  );
}
