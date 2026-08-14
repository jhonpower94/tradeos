import Typography from '@mui/joy/Typography';
import type { TypographyProps } from '@mui/joy/Typography';
import { formatCurrency, formatPercent } from '../utils/format';
import { monoSx } from '../theme/theme';

interface PnlTextProps {
  value: number | null | undefined;
  percent?: number | null;
  level?: TypographyProps['level'];
}

export function PnlText({ value, percent, level = 'body-sm' }: PnlTextProps) {
  const color =
    value === null || value === undefined || value === 0
      ? 'text.secondary'
      : value > 0
        ? 'success.plainColor'
        : 'danger.plainColor';

  return (
    <Typography level={level} sx={{ color, ...monoSx, fontWeight: 600 }}>
      {formatCurrency(value)}
      {percent !== undefined && percent !== null ? ` (${formatPercent(percent)})` : ''}
    </Typography>
  );
}
