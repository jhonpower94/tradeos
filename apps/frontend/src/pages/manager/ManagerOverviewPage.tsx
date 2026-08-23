import Box from '@mui/joy/Box';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { LoadingState } from '../../components/LoadingState';
import { StatCard } from '../../components/StatCard';

export function ManagerOverviewPage() {
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
  });
  const { data: invoicesData, isLoading: invLoading } = useQuery({
    queryKey: ['admin-invoices'],
    queryFn: () => adminApi.listInvoices(),
  });
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-subscription-settings'],
    queryFn: adminApi.getSubscriptionSettings,
  });

  if (usersLoading || invLoading || settingsLoading) return <LoadingState />;

  const users = Array.isArray(usersData) ? usersData : (usersData?.items ?? usersData?.users ?? []);
  const invoices = Array.isArray(invoicesData)
    ? invoicesData
    : (invoicesData?.items ?? invoicesData?.invoices ?? []);
  const pending = invoices.filter((i: { status: string }) => i.status === 'pending').length;
  const under = invoices.filter((i: { status: string }) => i.status === 'underpaid').length;
  const over = invoices.filter((i: { status: string }) => i.status === 'overpaid').length;
  const plans = settings?.plans ?? [];
  const wallets = settings?.wallets ?? [];

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        <StatCard label="Users" value={String(users.length)} />
        <StatCard label="Pending payments" value={String(pending)} />
        <StatCard label="Underpaid" value={String(under)} />
        <StatCard label="Overpaid" value={String(over)} />
      </Box>
      <Sheet variant="outlined" sx={{ p: 2.5, borderRadius: 'md' }}>
        <Typography level="title-md" sx={{ mb: 1 }}>
          Billing config
        </Typography>
        <Typography level="body-sm">
          {plans.length} plan(s) · {wallets.length} wallet(s) · default network{' '}
          {(settings?.defaultNetwork ?? 'trc20').toUpperCase()}
        </Typography>
      </Sheet>
    </Box>
  );
}
