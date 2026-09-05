import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import IconButton from '@mui/joy/IconButton';
import Typography from '@mui/joy/Typography';
import Close from '@mui/icons-material/Close';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { positionsApi, tradesApi } from '../api';
import { BiasChip } from '../components/BiasChip';
import { PageHeader } from '../components/PageHeader';
import { PnlText } from '../components/PnlText';
import { SideChip } from '../components/SideChip';
import { StatusChip } from '../components/StatusChip';
import { ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatPrice } from '../utils/format';
import { openTradeDisplayPnl, positionByTradeId } from '../utils/tradePnl';
import { monoSx } from '../theme/theme';

function errMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

type PositionContext = {
  tradeId: string;
  aligned: boolean;
  suggestion: string;
  message: string;
};

type CopyResult = {
  mode?: 'clone' | 'rescan';
  symbol?: string;
  count?: number;
  opportunity?: { stopLoss?: number; takeProfit?: number; primaryStrategy?: string };
};

export function TradesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['trades'], queryFn: tradesApi.list, refetchInterval: 10_000 });
  const { data: positionsData } = useQuery({
    queryKey: ['positions'],
    queryFn: positionsApi.list,
    refetchInterval: 5_000,
  });
  const { data: contexts } = useQuery({
    queryKey: ['positions-context'],
    queryFn: positionsApi.context,
    refetchInterval: 30_000,
  });
  const contextByTrade = new Map<string, PositionContext>(
    ((contexts?.items ?? []) as PositionContext[]).map((c) => [c.tradeId, c]),
  );
  const openByTrade = positionByTradeId(
    (positionsData?.items ?? []) as Array<Record<string, unknown>>,
  );

  const tradePnl = (t: Record<string, unknown>) => {
    if (t.status !== 'open') return Number(t.realizedPnl ?? 0);
    const pos = openByTrade.get(String(t._id));
    return openTradeDisplayPnl(
      Number(t.realizedPnl ?? 0),
      pos != null ? Number(pos.unrealizedPnl ?? 0) : 0,
    );
  };

  const renderPnl = (t: Record<string, unknown>) => {
    const pos = t.status === 'open' ? openByTrade.get(String(t._id)) : undefined;
    const realized = Number(t.realizedPnl ?? 0);
    const upnl = pos != null ? Number(pos.unrealizedPnl ?? 0) : 0;
    return (
      <Box>
        <PnlText value={tradePnl(t)} />
        {t.status === 'open' && pos ? (
          <Typography level="body-xs" sx={{ color: 'text.tertiary', display: 'block' }}>
            banked {realized.toFixed(2)} · open {upnl.toFixed(2)}
            {pos.partialTpDone ? ' · partial taken' : ''}
          </Typography>
        ) : null}
      </Box>
    );
  };

  const [copyInfo, setCopyInfo] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['trades'] });
    qc.invalidateQueries({ queryKey: ['positions'] });
    qc.invalidateQueries({ queryKey: ['positions-context'] });
    qc.invalidateQueries({ queryKey: ['portfolio'] });
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['signals'] });
  };

  const close = useMutation({
    mutationFn: (id: string) => tradesApi.close(id),
    onSuccess: () => {
      invalidate();
      // Post-close symbol rescan is fire-and-forget; refresh again after it can persist.
      window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['signals'] });
        void qc.invalidateQueries({ queryKey: ['opportunities'] });
      }, 2_000);
    },
  });

  const copyTrade = useMutation({
    mutationFn: (id: string) => tradesApi.copy(id),
    onSuccess: (res: CopyResult) => {
      invalidate();
      if (res.mode === 'rescan') {
        const n = res.count ?? 0;
        setCopyInfo(
          n > 0
            ? `Rescanned ${res.symbol ?? ''} · ${n} signal${n === 1 ? '' : 's'}`
            : `Rescanned ${res.symbol ?? ''} · no fresh signal`,
        );
        return;
      }
      const o = res.opportunity;
      setCopyInfo(
        o
          ? `Cloned · SL ${o.stopLoss != null ? formatPrice(o.stopLoss) : '—'} · TP ${o.takeProfit != null ? formatPrice(o.takeProfit) : '—'}`
          : 'Trade cloned',
      );
    },
  });

  const rows = (data?.items ?? []) as Array<Record<string, unknown>>;

  const actionError =
    (close.isError && errMsg(close.error)) ||
    (copyTrade.isError && errMsg(copyTrade.error)) ||
    null;

  const renderActions = (t: Record<string, unknown>) => {
    const isOpen = t.status === 'open';
    const isClosedWinner = t.status === 'closed' && Number(t.realizedPnl ?? 0) > 0;

    return (
      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {isOpen ? (
          <Button
            size="sm"
            variant="outlined"
            color="neutral"
            disabled={copyTrade.isPending}
            onClick={() => {
              setCopyInfo(null);
              copyTrade.mutate(String(t._id));
            }}
          >
            Copy
          </Button>
        ) : null}
        {isClosedWinner ? (
          <Button
            size="sm"
            variant="outlined"
            color="neutral"
            disabled={copyTrade.isPending}
            onClick={() => {
              setCopyInfo(null);
              copyTrade.mutate(String(t._id));
            }}
          >
            Rescan
          </Button>
        ) : null}
        {isOpen ? (
          <Button
            size="sm"
            color="warning"
            variant="outlined"
            disabled={close.isPending}
            onClick={() => close.mutate(String(t._id))}
          >
            Close
          </Button>
        ) : null}
      </Box>
    );
  };

  return (
    <Box>
      <PageHeader title="Trades" subtitle="Open and closed spot fills" />
      {actionError && (
        <Alert
          color="danger"
          sx={{ mb: 1 }}
          endDecorator={
            <IconButton
              size="sm"
              variant="plain"
              color="danger"
              onClick={() => {
                close.reset();
                copyTrade.reset();
              }}
            >
              <Close />
            </IconButton>
          }
        >
          {actionError}
        </Alert>
      )}
      {copyInfo && (
        <Alert
          color="success"
          sx={{ mb: 1 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="success" onClick={() => setCopyInfo(null)}>
              <Close />
            </IconButton>
          }
        >
          {copyInfo}
        </Alert>
      )}
      <ResponsiveRecordList
        rows={rows}
        getRowKey={(t) => String(t._id)}
        emptyTitle="No trades yet"
        cardTitle={(t) => (
          <Typography level="title-md" sx={monoSx}>
            {String(t.symbol)}
          </Typography>
        )}
        cardMeta={(t) => (
          <>
            <SideChip side={String(t.side)} />
            <StatusChip status={String(t.status)} />
          </>
        )}
        cardFields={[
          { label: 'Mode', render: (t) => String(t.mode) },
          {
            label: 'Qty',
            render: (t) => {
              const pos = t.status === 'open' ? openByTrade.get(String(t._id)) : undefined;
              const qty = pos != null ? Number(pos.qty) : Number(t.qty);
              return (
                <Box>
                  <Typography sx={monoSx}>{qty.toPrecision(6)}</Typography>
                  {pos?.partialTpDone ? (
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      remaining after partial
                    </Typography>
                  ) : null}
                </Box>
              );
            },
          },
          { label: 'Entry', render: (t) => <Typography sx={monoSx}>{formatPrice(Number(t.entryPrice ?? 0))}</Typography> },
          {
            label: 'Exit',
            render: (t) => (
              <Typography sx={monoSx}>{t.exitPrice ? formatPrice(Number(t.exitPrice)) : '—'}</Typography>
            ),
          },
          { label: 'PnL', render: (t) => renderPnl(t) },
          {
            label: 'Bias',
            render: (t) => {
              const ctx = t.status === 'open' ? contextByTrade.get(String(t._id)) : undefined;
              return ctx ? (
                <BiasChip aligned={ctx.aligned} suggestion={ctx.suggestion} message={ctx.message} />
              ) : (
                '—'
              );
            },
          },
        ]}
        cardActions={(t) => renderActions(t)}
        columns={[
          { key: 'symbol', header: 'Symbol', render: (t) => <Typography sx={monoSx}>{String(t.symbol)}</Typography> },
          { key: 'side', header: 'Side', render: (t) => <SideChip side={String(t.side)} /> },
          { key: 'mode', header: 'Mode', render: (t) => String(t.mode) },
          {
            key: 'qty',
            header: 'Qty',
            numeric: true,
            render: (t) => {
              const pos = t.status === 'open' ? openByTrade.get(String(t._id)) : undefined;
              const qty = pos != null ? Number(pos.qty) : Number(t.qty);
              return (
                <Box>
                  <Typography sx={monoSx}>{qty.toPrecision(6)}</Typography>
                  {pos?.partialTpDone ? (
                    <Chip size="sm" variant="soft" color="neutral" sx={{ mt: 0.25 }}>
                      remaining
                    </Chip>
                  ) : null}
                </Box>
              );
            },
          },
          { key: 'entry', header: 'Entry', numeric: true, render: (t) => formatPrice(Number(t.entryPrice ?? 0)) },
          { key: 'exit', header: 'Exit', numeric: true, render: (t) => (t.exitPrice ? formatPrice(Number(t.exitPrice)) : '—') },
          { key: 'pnl', header: 'PnL', render: (t) => renderPnl(t) },
          { key: 'status', header: 'Status', render: (t) => <StatusChip status={String(t.status)} /> },
          {
            key: 'bias',
            header: 'Bias',
            render: (t) => {
              const ctx = t.status === 'open' ? contextByTrade.get(String(t._id)) : undefined;
              return ctx ? (
                <BiasChip aligned={ctx.aligned} suggestion={ctx.suggestion} message={ctx.message} />
              ) : (
                '—'
              );
            },
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (t) => renderActions(t),
          },
        ]}
      />
    </Box>
  );
}
