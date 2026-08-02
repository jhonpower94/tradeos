import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';

export function BiasChip({
  aligned,
  suggestion,
  message,
}: {
  aligned: boolean;
  suggestion: string;
  message?: string;
}) {
  const theme = useTheme();
  const consider = suggestion === 'consider_close' || !aligned;
  const color = consider ? theme.palette.warning.main : theme.palette.long.main;
  const label = consider ? 'Consider close' : 'Aligned';

  const chip = (
    <Chip
      size="small"
      label={label}
      sx={{
        color,
        backgroundColor: alpha(color, 0.14),
        border: `1px solid ${alpha(color, 0.35)}`,
        fontWeight: 600,
      }}
    />
  );

  return message ? <Tooltip title={message}>{chip}</Tooltip> : chip;
}
