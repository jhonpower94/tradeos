import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';

const REGIME_LABEL: Record<string, string> = {
  trending_bull: 'Trending Bull',
  trending_bear: 'Trending Bear',
  ranging: 'Ranging',
  volatile: 'Volatile',
  compression: 'Compression',
  trending_volatile: 'Trending Volatile',
  unknown: 'Unknown',
};

export function RegimeChip({ regime }: { regime: string }) {
  const theme = useTheme();
  const color =
    regime === 'trending_bull'
      ? theme.palette.long.main
      : regime === 'trending_bear'
        ? theme.palette.short.main
        : regime === 'volatile' || regime === 'trending_volatile'
          ? theme.palette.warning.main
          : regime === 'compression'
            ? theme.palette.info.main
            : theme.palette.neutral.main;

  return (
    <Chip
      size="small"
      label={REGIME_LABEL[regime] ?? regime}
      sx={{
        color,
        backgroundColor: alpha(color, 0.14),
        border: `1px solid ${alpha(color, 0.35)}`,
        fontWeight: 600,
      }}
    />
  );
}
