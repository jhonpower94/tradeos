import Chip from '@mui/joy/Chip';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

export function SideChip({ side }: { side: 'BUY' | 'SELL' | string }) {
  const isLong = side === 'BUY' || side === 'LONG';

  return (
    <Chip
      size="sm"
      variant="soft"
      color={isLong ? 'success' : 'danger'}
      startDecorator={
        isLong ? <ArrowUpwardIcon sx={{ fontSize: 14 }} /> : <ArrowDownwardIcon sx={{ fontSize: 14 }} />
      }
    >
      {isLong ? 'LONG' : 'SHORT'}
    </Chip>
  );
}
