import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useQuery } from '@tanstack/react-query';
import { journalApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PnlText } from '../components/PnlText';
import { SideChip } from '../components/SideChip';
import { ResponsiveRecordList } from '../components/ResponsiveRecordList';
import { formatPrice } from '../utils/format';
import { monoSx } from '../theme/theme';

export function JournalPage() {
  const { data } = useQuery({ queryKey: ['journal'], queryFn: journalApi.list });
  const rows = (data?.items ?? []) as Array<Record<string, unknown>>;

  return (
    <Box>
      <PageHeader title="Journal" subtitle="Closed trades with entry and exit reasons" />
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
        columns={[]}
      />
    </Box>
  );
}
