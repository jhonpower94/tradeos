import Typography, { type TypographyProps } from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { formatCurrency, formatPercent } from '../utils/format';

interface PnlTextProps extends Omit<TypographyProps, 'color'> {
  value: number | null | undefined;
  percent?: number | null;
  variant?: TypographyProps['variant'];
}

export function PnlText({ value, percent, variant = 'body2', ...props }: PnlTextProps) {
  const theme = useTheme();
  const color =
    value === null || value === undefined || value === 0
      ? theme.palette.text.secondary
      : value > 0
        ? theme.palette.long.light
        : theme.palette.short.light;

  return (
    <Typography
      variant={variant}
      sx={{ color, fontFamily: theme.typography.mono.fontFamily, fontWeight: 600 }}
      {...props}
    >
      {formatCurrency(value)}
      {percent !== undefined && percent !== null ? ` (${formatPercent(percent)})` : ''}
    </Typography>
  );
}
