import { useState, type ReactNode } from 'react';
import Box from '@mui/joy/Box';
import Drawer from '@mui/joy/Drawer';
import IconButton from '@mui/joy/IconButton';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemButton from '@mui/joy/ListItemButton';
import ListItemContent from '@mui/joy/ListItemContent';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import Divider from '@mui/joy/Divider';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import RadarOutlined from '@mui/icons-material/RadarOutlined';
import CandlestickChartOutlined from '@mui/icons-material/CandlestickChartOutlined';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { authApi } from '../../api';
import { ConnectionStatusBadge } from '../../components/ConnectionStatusBadge';

const DRAWER = 240;

type NavItem = { to: string; label: string; icon: ReactNode };

const primaryNav: NavItem[] = [
  { to: '/', label: 'Home', icon: <HomeOutlined /> },
  { to: '/scanner', label: 'Scanner', icon: <RadarOutlined /> },
  { to: '/signals', label: 'Signals', icon: <BoltOutlined /> },
  { to: '/trades', label: 'Trades', icon: <ReceiptLongOutlined /> },
  { to: '/portfolio', label: 'Portfolio', icon: <AccountBalanceWalletOutlined /> },
];

const moreNav: NavItem[] = [
  { to: '/charts', label: 'Charts', icon: <CandlestickChartOutlined /> },
  { to: '/journal', label: 'Journal', icon: <MenuBookOutlined /> },
  { to: '/analytics', label: 'Analytics', icon: <InsightsOutlined /> },
  { to: '/backtest', label: 'Backtest', icon: <ScienceOutlined /> },
  { to: '/settings', label: 'Settings', icon: <SettingsOutlined /> },
];

const allNav = [...primaryNav, ...moreNav];

function isActive(pathname: string, to: string) {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate: (to: string) => void;
}) {
  return (
    <List size="sm" sx={{ '--ListItem-radius': '8px', '--ListItemDecorator-size': '36px', gap: 0.25, px: 1 }}>
      {items.map((item) => (
        <ListItem key={item.to}>
          <ListItemButton
            selected={isActive(pathname, item.to)}
            onClick={() => onNavigate(item.to)}
            color={isActive(pathname, item.to) ? 'primary' : 'neutral'}
          >
            <ListItemDecorator>{item.icon}</ListItemDecorator>
            <ListItemContent>{item.label}</ListItemContent>
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const user = useAuthStore((s) => s.user);
  const [moreOpen, setMoreOpen] = useState(false);
  useWebSocket();

  const moreActive = moreNav.some((item) => isActive(location.pathname, item.to));

  async function onLogout() {
    try {
      await authApi.logout(refreshToken);
    } catch {
      // still clear local session
    }
    logout();
  }

  function go(to: string) {
    navigate(to);
    setMoreOpen(false);
  }

  const brand = (
    <Box sx={{ px: 2, py: 2.25 }}>
      <Typography level="title-lg" sx={{ color: 'primary.plainColor', fontWeight: 700 }}>
        Trading OS
      </Typography>
      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
        Spot · Binance
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <Sheet
        variant="outlined"
        sx={{
          display: { xs: 'none', md: 'flex' },
          width: DRAWER,
          flexDirection: 'column',
          borderTop: 0,
          borderBottom: 0,
          borderLeft: 0,
          position: 'sticky',
          top: 0,
          height: '100dvh',
          bgcolor: 'background.surface',
        }}
      >
        {brand}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <NavList items={allNav} pathname={location.pathname} onNavigate={go} />
        </Box>
      </Sheet>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} sx={{ display: { md: 'none' } }}>
        <Box sx={{ width: 280, maxWidth: '100%' }}>
          {brand}
          <Divider />
          <Typography level="body-xs" sx={{ px: 2.5, pt: 1.5, color: 'text.tertiary', fontWeight: 600 }}>
            TRADE
          </Typography>
          <NavList items={primaryNav} pathname={location.pathname} onNavigate={go} />
          <Typography level="body-xs" sx={{ px: 2.5, pt: 1, color: 'text.tertiary', fontWeight: 600 }}>
            MORE
          </Typography>
          <NavList items={moreNav} pathname={location.pathname} onNavigate={go} />
        </Box>
      </Drawer>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Sheet
          variant="outlined"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            minHeight: 56,
            px: { xs: 1, md: 2 },
            py: 0.75,
            borderTop: 0,
            borderLeft: 0,
            borderRight: 0,
            bgcolor: 'rgba(14, 20, 28, 0.92)',
            backdropFilter: 'blur(12px)',
            pt: 'max(6px, env(safe-area-inset-top))',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <IconButton
              variant="plain"
              color="neutral"
              onClick={() => setMoreOpen(true)}
              sx={{ display: { md: 'none' } }}
              aria-label="Open menu"
            >
              <MenuOutlined />
            </IconButton>
            <Typography
              level="body-sm"
              sx={{ fontFamily: 'code', color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}
              noWrap
            >
              {user?.email ?? ''}
            </Typography>
            <Typography
              level="title-sm"
              sx={{ color: 'primary.plainColor', display: { xs: 'block', md: 'none' }, fontWeight: 700 }}
            >
              Trading OS
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
            <ConnectionStatusBadge />
            <IconButton variant="plain" color="neutral" onClick={() => void onLogout()} title="Logout">
              <LogoutOutlined />
            </IconButton>
          </Box>
        </Sheet>

        <Box
          sx={{
            p: { xs: 1.5, md: 2.5 },
            flex: 1,
            pb: { xs: 'calc(80px + env(safe-area-inset-bottom))', md: 2.5 },
          }}
        >
          <Outlet />
        </Box>

        <Sheet
          variant="outlined"
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            justifyContent: 'space-around',
            borderBottom: 0,
            borderLeft: 0,
            borderRight: 0,
            bgcolor: 'rgba(14, 20, 28, 0.96)',
            backdropFilter: 'blur(12px)',
            pb: 'env(safe-area-inset-bottom)',
            pt: 0.5,
          }}
        >
          {primaryNav.map((item) => {
            const active = isActive(location.pathname, item.to);
            return (
              <IconButton
                key={item.to}
                variant="plain"
                color={active ? 'primary' : 'neutral'}
                onClick={() => go(item.to)}
                sx={{
                  flexDirection: 'column',
                  gap: 0.15,
                  borderRadius: 0,
                  minWidth: 56,
                  py: 0.75,
                  '--Icon-fontSize': '22px',
                }}
              >
                {item.icon}
                <Typography level="body-xs" component="span" sx={{ fontSize: '0.65rem', fontWeight: active ? 700 : 500 }}>
                  {item.label}
                </Typography>
              </IconButton>
            );
          })}
          <IconButton
            variant="plain"
            color={moreActive ? 'primary' : 'neutral'}
            onClick={() => setMoreOpen(true)}
            sx={{
              flexDirection: 'column',
              gap: 0.15,
              borderRadius: 0,
              minWidth: 56,
              py: 0.75,
              '--Icon-fontSize': '22px',
            }}
          >
            <MoreHoriz />
            <Typography level="body-xs" component="span" sx={{ fontSize: '0.65rem', fontWeight: moreActive ? 700 : 500 }}>
              More
            </Typography>
          </IconButton>
        </Sheet>
      </Box>
    </Box>
  );
}
