import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { useLiveStore } from '../stores/liveStore';

const LABELS: Record<string, string> = {
  connected: 'Live',
  connecting: 'Connecting…',
  disconnected: 'Offline',
  error: 'Connection error',
};

export function ConnectionStatusBadge() {
  const theme = useTheme();
  const status = useLiveStore((s) => s.connectionStatus);

  const color =
    status === 'connected'
      ? theme.palette.long.main
      : status === 'connecting'
        ? theme.palette.warning.main
        : theme.palette.short.main;

  return (
    <Tooltip title={`Realtime feed: ${LABELS[status]}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1 }}>
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: color,
            boxShadow: status === 'connected' ? `0 0 6px ${color}` : 'none',
            animation: status === 'connecting' ? 'pulse 1.4s ease-in-out infinite' : 'none',
            '@keyframes pulse': {
              '0%': { opacity: 0.4 },
              '50%': { opacity: 1 },
              '100%': { opacity: 0.4 },
            },
          }}
        />
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
          {LABELS[status]}
        </Typography>
      </Box>
    </Tooltip>
  );
}
