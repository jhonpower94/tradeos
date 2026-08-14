import Box from '@mui/joy/Box';
import Chip from '@mui/joy/Chip';
import Tooltip from '@mui/joy/Tooltip';
import { useLiveStore } from '../stores/liveStore';

const LABELS: Record<string, string> = {
  connected: 'Live',
  connecting: 'Connecting…',
  disconnected: 'Offline',
  error: 'Error',
};

export function ConnectionStatusBadge() {
  const status = useLiveStore((s) => s.connectionStatus);
  const color =
    status === 'connected' ? 'success' : status === 'connecting' ? 'warning' : 'danger';

  return (
    <Tooltip title={`Realtime feed: ${LABELS[status] ?? status}`} size="sm">
      <Chip
        size="sm"
        variant="outlined"
        color={color}
        startDecorator={
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: 'currentColor',
              boxShadow: status === 'connected' ? '0 0 6px currentColor' : 'none',
              animation: status === 'connecting' ? 'trading-pulse 1.4s ease-in-out infinite' : 'none',
            }}
          />
        }
      >
        {LABELS[status] ?? status}
      </Chip>
    </Tooltip>
  );
}
