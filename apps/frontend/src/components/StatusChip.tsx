import Chip from '@mui/joy/Chip';
import type { ColorPaletteProp } from '@mui/joy/styles';

type Tone = ColorPaletteProp;

const STATUS_TONE: Record<string, Tone> = {
  ranked: 'primary',
  approved: 'success',
  rejected: 'danger',
  expired: 'neutral',
  executed: 'success',
  pending: 'warning',
  open: 'success',
  partially_filled: 'warning',
  closed: 'neutral',
  cancelled: 'neutral',
  failed: 'danger',
  closing: 'warning',
  completed: 'success',
  running: 'primary',
};

export function StatusChip({ status }: { status: string }) {
  const color = STATUS_TONE[status] ?? 'neutral';

  return (
    <Chip size="sm" variant="soft" color={color} sx={{ textTransform: 'capitalize' }}>
      {status.replace(/_/g, ' ')}
    </Chip>
  );
}
