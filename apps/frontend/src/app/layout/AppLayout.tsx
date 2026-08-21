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
import { ColorModeToggle } from '../../components/ColorModeToggle';

const DRAWER = 264;

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
    <List
      size="md"
      sx={{ '--ListItem-radius': '12px', '--ListItemDecorator-size': '40px', gap: 0.5, px: 1.5 }}
    >
      {items.map((item) => (
        <ListItem key={item.to}>
          <ListItemButton
            selected={isActive(pathname, item.to)}
            onClick={() => onNavigate(item.to)}
            color={isActive(pathname, item.to) ? 'primary' : 'neutral'}
            variant={isActive(pathname, item.to) ? 'soft' : 'plain'}
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
    <Box sx={{ px: 2.5, py: 3 }}>
      <Typography level="title-lg" sx={{ color: 'primary.plainColor', fontWeight: 700, letterSpacing: -0.4 }}>
        Trading OS
      </Typography>
      <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
        Spot · Binance
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.body' }}>
      <Sheet
        variant="plain"
        sx={{
          display: { xs: 'none', md: 'flex' },
          width: DRAWER,
          flexDirection: 'column',
          borderRight: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          height: '100dvh',
          bgcolor: 'background.surface',
        }}
      >
        {brand}
        <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
          <NavList items={allNav} pathname={location.pathname} onNavigate={go} />
        </Box>
      </Sheet>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} sx={{ display: { md: 'none' } }}>
        <Box sx={{ width: 300, maxWidth: '100%', py: 1 }}>
          {brand}
          <Divider />
          <Typography
            level="body-xs"
            sx={{ px: 2.5, pt: 2, pb: 0.5, color: 'text.tertiary', fontWeight: 600, letterSpacing: 0.8 }}
          >
            TRADE
          </Typography>
          <NavList items={primaryNav} pathname={location.pathname} onNavigate={go} />
          <Typography
            level="body-xs"
            sx={{ px: 2.5, pt: 1.5, pb: 0.5, color: 'text.tertiary', fontWeight: 600, letterSpacing: 0.8 }}
          >
            MORE
          </Typography>
          <NavList items={moreNav} pathname={location.pathname} onNavigate={go} />
        </Box>
      </Drawer>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Sheet
          variant="plain"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            minHeight: 64,
            px: { xs: 1.5, md: 3 },
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.surface',
            pt: 'max(8px, env(safe-area-inset-top))',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
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
              sx={{ fontFamily: 'var(--joy-fontFamily-code)', color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}
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
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <ConnectionStatusBadge />
            <ColorModeToggle />
            <IconButton variant="plain" color="neutral" onClick={() => void onLogout()} title="Logout">
              <LogoutOutlined />
            </IconButton>
          </Box>
        </Sheet>

        <Box
          sx={{
            width: '100%',
            maxWidth: location.pathname.startsWith('/signals') ? 1800 : 1280,
            mx: 'auto',
            px: { xs: 2.5, md: 4 },
            py: { xs: 3, md: 4 },
            flex: 1,
            pb: { xs: 'calc(108px + env(safe-area-inset-bottom))', md: 5 },
          }}
        >
          <Outlet />
        </Box>

        <Sheet
          variant="plain"
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            justifyContent: 'space-around',
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.surface',
            pb: 'env(safe-area-inset-bottom)',
            pt: 1,
            px: 0.5,
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
                  gap: 0.4,
                  borderRadius: '12px',
                  minWidth: 56,
                  py: 1,
                  '--Icon-fontSize': '22px',
                }}
              >
                {item.icon}
                <Typography
                  level="body-xs"
                  component="span"
                  sx={{ fontSize: '0.65rem', fontWeight: active ? 700 : 500 }}
                >
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
              gap: 0.4,
              borderRadius: '12px',
              minWidth: 56,
              py: 1,
              '--Icon-fontSize': '22px',
            }}
          >
            <MoreHoriz />
            <Typography
              level="body-xs"
              component="span"
              sx={{ fontSize: '0.65rem', fontWeight: moreActive ? 700 : 500 }}
            >
              More
            </Typography>
          </IconButton>
        </Sheet>
      </Box>
    </Box>
  );
}
