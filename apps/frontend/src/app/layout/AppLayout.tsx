import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  AppBar,
  Toolbar,
  Chip,
  IconButton,
} from '@mui/material';
import {
  HomeOutlined,
  RadarOutlined,
  CandlestickChartOutlined,
  BoltOutlined,
  ReceiptLongOutlined,
  AccountBalanceWalletOutlined,
  MenuBookOutlined,
  InsightsOutlined,
  SettingsOutlined,
  ScienceOutlined,
  LogoutOutlined,
} from '@mui/icons-material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useLiveStore } from '../../stores/liveStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { authApi } from '../../api';

const DRAWER = 220;

const nav = [
  { to: '/', label: 'Home', icon: <HomeOutlined /> },
  { to: '/scanner', label: 'Scanner', icon: <RadarOutlined /> },
  { to: '/charts', label: 'Charts', icon: <CandlestickChartOutlined /> },
  { to: '/signals', label: 'Signals', icon: <BoltOutlined /> },
  { to: '/trades', label: 'Trades', icon: <ReceiptLongOutlined /> },
  { to: '/portfolio', label: 'Portfolio', icon: <AccountBalanceWalletOutlined /> },
  { to: '/journal', label: 'Journal', icon: <MenuBookOutlined /> },
  { to: '/analytics', label: 'Analytics', icon: <InsightsOutlined /> },
  { to: '/backtest', label: 'Backtest', icon: <ScienceOutlined /> },
  { to: '/settings', label: 'Settings', icon: <SettingsOutlined /> },
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const user = useAuthStore((s) => s.user);
  const connectionStatus = useLiveStore((s) => s.connectionStatus);
  useWebSocket();

  async function onLogout() {
    try {
      await authApi.logout(refreshToken);
    } catch {
      // still clear local session
    }
    logout();
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER,
          [`& .MuiDrawer-paper`]: { width: DRAWER, boxSizing: 'border-box' },
        }}
      >
        <Box sx={{ px: 2, py: 2.5 }}>
          <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 700 }}>
            Trading OS
          </Typography>
          <Typography variant="caption">Spot · Binance</Typography>
        </Box>
        <List dense>
          {nav.map((item) => (
            <ListItemButton
              key={item.to}
              selected={location.pathname === item.to}
              onClick={() => navigate(item.to)}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" color="transparent">
          <Toolbar sx={{ justifyContent: 'space-between', minHeight: 56 }}>
            <Typography variant="subtitle1" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
              {user?.email ?? ''}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip
                size="small"
                label={connectionStatus}
                color={connectionStatus === 'connected' ? 'success' : 'default'}
                variant="outlined"
              />
              <IconButton onClick={() => void onLogout()} size="small" title="Logout">
                <LogoutOutlined />
              </IconButton>
            </Box>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 2.5, flex: 1 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
