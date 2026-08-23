import Box from '@mui/joy/Box';
import Tab from '@mui/joy/Tab';
import TabList from '@mui/joy/TabList';
import Tabs from '@mui/joy/Tabs';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';

const TABS = [
  { path: '/manager', label: 'Overview', end: true },
  { path: '/manager/users', label: 'Users' },
  { path: '/manager/subscriptions', label: 'Subscriptions' },
  { path: '/manager/payments', label: 'Payments' },
] as const;

function tabIndex(pathname: string) {
  const i = TABS.findIndex((t) =>
    'end' in t && t.end ? pathname === t.path : pathname === t.path || pathname.startsWith(`${t.path}/`),
  );
  return i >= 0 ? i : 0;
}

export function ManagerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const value = tabIndex(location.pathname);

  return (
    <Box>
      <PageHeader title="Manager" subtitle="Admin users, plans, wallets, and payment exceptions" />
      <Tabs
        value={value}
        onChange={(_, v) => {
          const tab = TABS[v as number];
          if (tab) navigate(tab.path);
        }}
        sx={{ mb: 2.5, bgcolor: 'transparent' }}
      >
        <TabList
          disableUnderline
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
            gap: 0.75,
            p: 0.75,
            bgcolor: 'background.level1',
            borderRadius: 'lg',
          }}
        >
          {TABS.map((t, i) => (
            <Tab
              key={t.path}
              value={i}
              variant={value === i ? 'solid' : 'plain'}
              color={value === i ? 'primary' : 'neutral'}
              sx={{ borderRadius: 'md', justifyContent: 'center', minHeight: 40 }}
            >
              {t.label}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      <Outlet />
    </Box>
  );
}
