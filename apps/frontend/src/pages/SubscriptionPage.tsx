import { useMemo, useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import Link from '@mui/joy/Link';
import { subscriptionApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { formatDateTime } from '../utils/format';
import { monoSx } from '../theme/theme';
import { useAuthStore } from '../stores/authStore';

type Plan = {
  id: string;
  name: string;
  priceUsdt: number;
  durationDays: number;
  active?: boolean;
};

type Invoice = {
  _id: string;
  planId: string;
  network: string;
  address: string;
  amountUsdt: number;
  baseAmountUsdt: number;
  status: string;
  txHash?: string;
  observedAmount?: number;
  expiresAt?: string;
  createdAt?: string;
  note?: string;
};

function errMsg(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message ?? e?.message ?? 'Request failed';
}

export function SubscriptionPage() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const qc = useQueryClient();
  const [planId, setPlanId] = useState<string | null>(null);
  const [network, setNetwork] = useState<string>('trc20');
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [txHash, setTxHash] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const { data: status } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: subscriptionApi.status,
  });

  const { data: plansData } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: subscriptionApi.plans,
  });

  const { data: invoicesData, refetch: refetchInvoices } = useQuery({
    queryKey: ['subscription-invoices'],
    queryFn: subscriptionApi.myInvoices,
  });

  const plans: Plan[] = plansData?.plans ?? plansData?.items ?? [];
  const wallets: Array<{ network: string; address: string }> = plansData?.wallets ?? [];
  const networks = useMemo(() => {
    const fromWallets = wallets.map((w) => w.network);
    return fromWallets.length ? fromWallets : ['trc20', 'bep20', 'erc20'];
  }, [wallets]);

  const invoices: Invoice[] = Array.isArray(invoicesData)
    ? invoicesData
    : (invoicesData?.items ?? invoicesData?.invoices ?? []);

  const createInv = useMutation({
    mutationFn: () =>
      subscriptionApi.createInvoice({
        planId: planId!,
        network,
      }),
    onSuccess: (inv) => {
      setActiveInvoice(inv);
      setErr('');
      setMsg('Invoice created — send the exact USDT amount below');
      void refetchInvoices();
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const submitTx = useMutation({
    mutationFn: () => subscriptionApi.submitTx(activeInvoice!._id, txHash.trim()),
    onSuccess: (inv) => {
      setActiveInvoice(inv);
      setTxHash('');
      setMsg('Transaction submitted — awaiting confirmation');
      void refetchInvoices();
      void qc.invalidateQueries({ queryKey: ['subscription-status'] });
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const refreshMe = useMutation({
    mutationFn: async () => {
      const { authApi } = await import('../api');
      return authApi.me();
    },
    onSuccess: (me) => {
      if (token) setAuth(token, me, refreshToken);
      void qc.invalidateQueries({ queryKey: ['subscription-status'] });
      setMsg('Status refreshed');
    },
  });

  const subActive = Boolean(status?.active ?? user?.subscription?.active);
  const endsAt = status?.endsAt ?? user?.subscription?.endsAt;

  return (
    <Box>
      <PageHeader
        title="Subscription"
        subtitle="USDT billing unlocks live trading. Paper mode stays free."
        actions={
          <Button variant="outlined" size="sm" onClick={() => refreshMe.mutate()}>
            Refresh status
          </Button>
        }
      />

      {err && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}
      {msg && (
        <Alert color="success" sx={{ mb: 2 }}>
          {msg}
        </Alert>
      )}

      <Sheet variant="outlined" sx={{ p: 2.5, borderRadius: 'md', mb: 3, maxWidth: 560 }}>
        <Typography level="title-md" sx={{ mb: 1 }}>
          Current status
        </Typography>
        {user?.role === 'admin' ? (
          <Typography level="body-sm">Admin accounts have live access without a subscription.</Typography>
        ) : subActive ? (
          <Typography level="body-sm">
            Active{endsAt ? ` until ${formatDateTime(endsAt)}` : ''}
            {status?.planId || user?.subscription?.planId
              ? ` · plan ${status?.planId ?? user?.subscription?.planId}`
              : ''}
          </Typography>
        ) : (
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            No active subscription. Choose a plan below to unlock live trading.
          </Typography>
        )}
        <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
          Manage trading mode in{' '}
          <Link component={RouterLink} to="/settings">
            Settings → Trading
          </Link>
          .
        </Typography>
      </Sheet>

      <Typography level="title-md" sx={{ mb: 1.5 }}>
        Plans
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          maxWidth: 720,
          mb: 3,
        }}
      >
        {plans.map((p) => (
          <Sheet
            key={p.id}
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 'md',
              borderColor: planId === p.id ? 'primary.outlinedBorder' : 'divider',
              cursor: 'pointer',
            }}
            onClick={() => setPlanId(p.id)}
          >
            <Typography level="title-sm">{p.name}</Typography>
            <Typography level="h4" sx={{ mt: 0.5, fontFamily: 'var(--joy-fontFamily-code)' }}>
              {Number(p.priceUsdt).toFixed(2)} USDT
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              {p.durationDays} days
            </Typography>
          </Sheet>
        ))}
        {!plans.length && (
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            No plans available yet.
          </Typography>
        )}
      </Box>

      <Sheet variant="outlined" sx={{ p: 2.5, borderRadius: 'md', maxWidth: 560, mb: 3, display: 'grid', gap: 2 }}>
        <FormControl>
          <FormLabel>Network</FormLabel>
          <Select value={network} onChange={(_, v) => v && setNetwork(v)}>
            {networks.map((n) => (
              <Option key={n} value={n}>
                {n.toUpperCase()}
              </Option>
            ))}
          </Select>
        </FormControl>
        <Button
          disabled={!planId || createInv.isPending}
          loading={createInv.isPending}
          onClick={() => createInv.mutate()}
        >
          Create invoice
        </Button>
      </Sheet>

      {activeInvoice && (
        <Sheet variant="outlined" sx={{ p: 2.5, borderRadius: 'md', maxWidth: 560, mb: 3, display: 'grid', gap: 1.5 }}>
          <Typography level="title-md">Pay this invoice</Typography>
          <Alert color="warning" variant="soft">
            Send exactly this amount. A unique micro-offset identifies your payment.
          </Alert>
          <Typography level="body-sm">
            Amount:{' '}
            <Typography component="span" sx={monoSx} level="title-md">
              {Number(activeInvoice.amountUsdt).toFixed(6)} USDT
            </Typography>
          </Typography>
          <Typography level="body-sm">
            Network:{' '}
            <Typography component="span" sx={{ fontWeight: 600 }}>
              {activeInvoice.network.toUpperCase()}
            </Typography>
          </Typography>
          <Typography level="body-sm">
            Address:{' '}
            <Typography component="span" sx={{ ...monoSx, wordBreak: 'break-all' }}>
              {activeInvoice.address}
            </Typography>
          </Typography>
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            Status: <StatusChip status={activeInvoice.status} />
            {activeInvoice.expiresAt ? ` · expires ${formatDateTime(activeInvoice.expiresAt)}` : ''}
          </Typography>
          {(activeInvoice.status === 'pending' || activeInvoice.status === 'underpaid') && (
            <>
              <FormControl>
                <FormLabel>Transaction hash</FormLabel>
                <Input
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="Paste tx hash after sending"
                  sx={monoSx}
                />
              </FormControl>
              <Button
                disabled={!txHash.trim() || submitTx.isPending}
                loading={submitTx.isPending}
                onClick={() => submitTx.mutate()}
              >
                Submit tx hash
              </Button>
            </>
          )}
        </Sheet>
      )}

      <Typography level="title-md" sx={{ mb: 1.5 }}>
        Your invoices
      </Typography>
      <Box sx={{ display: 'grid', gap: 1, maxWidth: 720 }}>
        {invoices.map((inv) => (
          <Sheet
            key={inv._id}
            variant="outlined"
            sx={{ p: 1.75, borderRadius: 'md', display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}
          >
            <Box>
              <Typography level="title-sm" sx={monoSx}>
                {Number(inv.amountUsdt).toFixed(6)} USDT
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                {inv.planId} · {inv.network.toUpperCase()}
                {inv.createdAt ? ` · ${formatDateTime(inv.createdAt)}` : ''}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StatusChip status={inv.status} />
              <Button size="sm" variant="plain" onClick={() => setActiveInvoice(inv)}>
                Open
              </Button>
            </Box>
          </Sheet>
        ))}
        {!invoices.length && (
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            No invoices yet.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
