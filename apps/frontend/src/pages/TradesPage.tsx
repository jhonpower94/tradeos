import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { positionsApi, tradesApi } from '../api';
import { BiasChip } from '../components/BiasChip';
import { PageHeader } from '../components/PageHeader';
import { PnlText } from '../components/PnlText';
import { SideChip } from '../components/SideChip';
import { StatusChip } from '../components/StatusChip';
import { ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatPrice } from '../utils/format';
import { monoSx } from '../theme/theme';

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

  const rows = (data?.items ?? []) as Array<Record<string, unknown>>;

  return (
    <Box>
      <PageHeader title="Trades" subtitle="Open and closed spot fills" />
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
          { label: 'Qty', render: (t) => <Typography sx={monoSx}>{Number(t.qty).toPrecision(6)}</Typography> },
          { label: 'Entry', render: (t) => <Typography sx={monoSx}>{formatPrice(Number(t.entryPrice ?? 0))}</Typography> },
          {
            label: 'Exit',
            render: (t) => (
              <Typography sx={monoSx}>{t.exitPrice ? formatPrice(Number(t.exitPrice)) : '—'}</Typography>
            ),
          },
          { label: 'PnL', render: (t) => <PnlText value={Number(t.realizedPnl ?? 0)} /> },
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
        cardActions={(t) =>
          t.status === 'open' ? (
            <Button color="warning" variant="outlined" onClick={() => close.mutate(String(t._id))}>
              Close
            </Button>
          ) : null
        }
        columns={[
          { key: 'symbol', header: 'Symbol', render: (t) => <Typography sx={monoSx}>{String(t.symbol)}</Typography> },
          { key: 'side', header: 'Side', render: (t) => <SideChip side={String(t.side)} /> },
          { key: 'mode', header: 'Mode', render: (t) => String(t.mode) },
          { key: 'qty', header: 'Qty', numeric: true, render: (t) => Number(t.qty).toPrecision(6) },
          { key: 'entry', header: 'Entry', numeric: true, render: (t) => formatPrice(Number(t.entryPrice ?? 0)) },
          { key: 'exit', header: 'Exit', numeric: true, render: (t) => (t.exitPrice ? formatPrice(Number(t.exitPrice)) : '—') },
          { key: 'pnl', header: 'PnL', render: (t) => <PnlText value={Number(t.realizedPnl ?? 0)} /> },
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
            render: (t) =>
              t.status === 'open' ? (
                <Button size="sm" color="warning" variant="outlined" onClick={() => close.mutate(String(t._id))}>
                  Close
                </Button>
              ) : null,
          },
        ]}
      />
    </Box>
  );
}
