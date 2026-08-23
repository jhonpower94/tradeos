import { useMemo, useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { LoadingState } from '../../components/LoadingState';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime } from '../../utils/format';
import { monoSx } from '../../theme/theme';

type Invoice = {
  _id: string;
  userId: string;
  planId: string;
  network: string;
  address: string;
  amountUsdt: number;
  observedAmount?: number;
  status: string;
  txHash?: string;
  note?: string;
  createdAt?: string;
};

function errMsg(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message ?? e?.message ?? 'Request failed';
}

export function ManagerPaymentsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('exceptions');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const statusParam = filter === 'exceptions' || filter === 'all' ? undefined : filter;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-invoices', statusParam ?? filter],
    queryFn: () => adminApi.listInvoices(statusParam ? { status: statusParam } : undefined),
  });

  const invoices: Invoice[] = useMemo(() => {
    const raw = Array.isArray(data) ? data : (data?.items ?? data?.invoices ?? []);
    if (filter !== 'exceptions') return raw;
    return raw.filter((i: Invoice) => ['underpaid', 'overpaid', 'pending'].includes(i.status));
  }, [data, filter]);

  const confirm = useMutation({
    mutationFn: (id: string) => adminApi.confirmInvoice(id),
    onSuccess: () => {
      setMsg('Invoice confirmed');
      void qc.invalidateQueries({ queryKey: ['admin-invoices'] });
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const reject = useMutation({
    mutationFn: (id: string) => adminApi.rejectInvoice(id, { note: 'Rejected by admin' }),
    onSuccess: () => {
      setMsg('Invoice rejected');
      void qc.invalidateQueries({ queryKey: ['admin-invoices'] });
    },
    onError: (e) => setErr(errMsg(e)),
  });

  if (isLoading) return <LoadingState />;

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {err && (
        <Alert color="danger">
          {err}
        </Alert>
      )}
      {msg && (
        <Alert color="success">
          {msg}
        </Alert>
      )}

      <FormControl size="sm" sx={{ maxWidth: 240 }}>
        <FormLabel>Filter</FormLabel>
        <Select value={filter} onChange={(_, v) => v && setFilter(v)}>
          <Option value="exceptions">Under / over / pending</Option>
          <Option value="underpaid">Underpaid</Option>
          <Option value="overpaid">Overpaid</Option>
          <Option value="pending">Pending</Option>
          <Option value="all">All</Option>
        </Select>
      </FormControl>

      <Box sx={{ display: 'grid', gap: 1.25 }}>
        {invoices.map((inv) => (
          <Sheet
            key={inv._id}
            variant="outlined"
            sx={{ p: 2, borderRadius: 'md', display: 'grid', gap: 1 }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography level="title-sm" sx={monoSx}>
                  {Number(inv.amountUsdt).toFixed(6)} USDT
                  {inv.observedAmount != null
                    ? ` (observed ${Number(inv.observedAmount).toFixed(6)})`
                    : ''}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  {inv.planId} · {inv.network.toUpperCase()} · user {String(inv.userId)}
                  {inv.createdAt ? ` · ${formatDateTime(inv.createdAt)}` : ''}
                </Typography>
                {inv.txHash && (
                  <Typography level="body-xs" sx={{ ...monoSx, wordBreak: 'break-all', mt: 0.5 }}>
                    {inv.txHash}
                  </Typography>
                )}
              </Box>
              <StatusChip status={inv.status} />
            </Box>
            {(inv.status === 'pending' ||
              inv.status === 'underpaid' ||
              inv.status === 'overpaid') && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="sm" onClick={() => confirm.mutate(inv._id)}>
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  color="danger"
                  onClick={() => reject.mutate(inv._id)}
                >
                  Reject
                </Button>
              </Box>
            )}
          </Sheet>
        ))}
        {!invoices.length && (
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            No invoices in this view.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
