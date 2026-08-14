import Box from '@mui/joy/Box';
import LinearProgress from '@mui/joy/LinearProgress';
import Typography from '@mui/joy/Typography';
import { monoSx } from '../theme/theme';

export function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? 'success' : value >= 60 ? 'warning' : 'danger';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 90 }}>
      <LinearProgress
        determinate
        value={Math.min(value, 100)}
        color={color}
        sx={{ flex: 1 }}
      />
      <Typography
        level="body-xs"
        component="span"
        sx={{ ...monoSx, color: `${color}.plainColor`, minWidth: 32 }}
      >
        {value.toFixed(0)}
      </Typography>
    </Box>
  );
}
