import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import IconButton from '@mui/joy/IconButton';
import Typography from '@mui/joy/Typography';
import Close from '@mui/icons-material/Close';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { journalApi, tradesApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PnlText } from '../components/PnlText';
import { SideChip } from '../components/SideChip';
import { ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatPrice } from '../utils/format';
import { monoSx } from '../theme/theme';

function errMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

type CopyResult = {
  mode?: 'clone' | 'rescan';
  symbol?: string;
  count?: number;
};

export function JournalPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['journal'], queryFn: journalApi.list });
  const rows = (data?.items ?? []) as Array<Record<string, unknown>>;
  const [rescanInfo, setRescanInfo] = useState<string | null>(null);

  const rescanTrade = useMutation({
    mutationFn: (tradeId: string) => tradesApi.copy(tradeId),
    onSuccess: (res: CopyResult) => {
      qc.invalidateQueries({ queryKey: ['signals'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      const n = res.count ?? 0;
      setRescanInfo(
        n > 0
          ? `Rescanned ${res.symbol ?? ''} · ${n} signal${n === 1 ? '' : 's'}`
          : `Rescanned ${res.symbol ?? ''} · no fresh signal`,
      );
    },
  });

  const actionError = rescanTrade.isError ? errMsg(rescanTrade.error) : null;

  const renderRescan = (j: Record<string, unknown>) => {
    if (Number(j.pnl ?? 0) <= 0 || !j.tradeId) return null;
    return (
      <Button
        size="sm"
        variant="outlined"
        color="neutral"
        disabled={rescanTrade.isPending}
        onClick={() => {
          setRescanInfo(null);
          rescanTrade.mutate(String(j.tradeId));
        }}
      >
        Rescan
      </Button>
    );
  };

  return (
    <Box>
      <PageHeader title="Journal" subtitle="Closed trades with entry and exit reasons" />
      {actionError && (
        <Alert
          color="danger"
          sx={{ mb: 1 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => rescanTrade.reset()}>
              <Close />
            </IconButton>
          }
        >
          {actionError}
        </Alert>
      )}
      {rescanInfo && (
        <Alert
          color="success"
          sx={{ mb: 1 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="success" onClick={() => setRescanInfo(null)}>
              <Close />
            </IconButton>
          }
        >
          {rescanInfo}
        </Alert>
      )}
      <ResponsiveRecordList
        cardsOnly
        rows={rows}
        getRowKey={(j) => String(j._id)}
        emptyTitle="No journal entries yet"
        cardTitle={(j) => (
          <Typography level="title-md" sx={monoSx}>
            {String(j.symbol)}
          </Typography>
        )}
        cardMeta={(j) => (
          <>
            <SideChip side={String(j.side)} />
            <PnlText value={Number(j.pnl ?? 0)} />
          </>
        )}
        cardFields={[
          { label: 'Strategy', render: (j) => String(j.strategy ?? '—') },
          { label: 'Confidence', render: (j) => (j.confidence != null ? `${Number(j.confidence).toFixed(0)}%` : '—') },
          { label: 'Entry', render: (j) => <Typography sx={monoSx}>{formatPrice(Number(j.entry ?? 0))}</Typography> },
          { label: 'Exit', render: (j) => <Typography sx={monoSx}>{formatPrice(Number(j.exit ?? 0))}</Typography> },
          {
            label: 'Entry reason',
            span: 2,
            render: (j) => (
              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                {String(j.entryReason ?? '—')}
              </Typography>
            ),
          },
          {
            label: 'Exit reason',
            span: 2,
            render: (j) => (
              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                {String(j.exitReason ?? '—')}
              </Typography>
            ),
          },
        ]}
        cardActions={(j) => renderRescan(j)}
        columns={[]}
      />
    </Box>
  );
}
