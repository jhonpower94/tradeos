import Chip, { type ChipProps } from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const STATUS_TONE: Record<string, Tone> = {
  ranked: 'info',
  approved: 'success',
  rejected: 'error',
  expired: 'neutral',
  executed: 'success',
  pending: 'warning',
  open: 'success',
  partially_filled: 'warning',
  closed: 'neutral',
  cancelled: 'neutral',
  failed: 'error',
  closing: 'warning',
  completed: 'success',
  running: 'info',
};

export function StatusChip({ status, ...props }: { status: string } & Omit<ChipProps, 'color'>) {
  const theme = useTheme();
  const tone = STATUS_TONE[status] ?? 'neutral';

  const colorMap: Record<Tone, string> = {
    success: theme.palette.long.main,
    warning: theme.palette.warning.main,
    error: theme.palette.short.main,
    info: theme.palette.secondary.main,
    neutral: theme.palette.neutral.main,
  };
  const color = colorMap[tone];

  return (
    <Chip
      size="small"
      label={status.replace(/_/g, ' ')}
      sx={{
        color,
        backgroundColor: alpha(color, 0.14),
        border: `1px solid ${alpha(color, 0.35)}`,
        textTransform: 'capitalize',
        ...props.sx,
      }}
      {...props}
    />
  );
}
