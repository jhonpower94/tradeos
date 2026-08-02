import Chip, { type ChipProps } from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

interface SideChipProps extends Omit<ChipProps, 'color'> {
  side: 'BUY' | 'SELL' | string;
}

export function SideChip({ side, ...props }: SideChipProps) {
  const theme = useTheme();
  const isLong = side === 'BUY' || side === 'LONG';
  const palette = isLong ? theme.palette.long : theme.palette.short;

  return (
    <Chip
      size="small"
      icon={
        isLong ? (
          <ArrowUpwardIcon sx={{ fontSize: '14px !important' }} />
        ) : (
          <ArrowDownwardIcon sx={{ fontSize: '14px !important' }} />
        )
      }
      label={isLong ? 'LONG' : 'SHORT'}
      sx={{
        color: palette.light,
        backgroundColor: alpha(palette.main, 0.14),
        border: `1px solid ${alpha(palette.main, 0.35)}`,
        '& .MuiChip-icon': { color: palette.light },
        ...props.sx,
      }}
      {...props}
    />
  );
}
