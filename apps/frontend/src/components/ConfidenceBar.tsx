import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

export function ConfidenceBar({ value }: { value: number }) {
  const theme = useTheme();
  const color =
    value >= 80 ? theme.palette.long.main : value >= 60 ? theme.palette.warning.main : theme.palette.short.main;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 90 }}>
      <LinearProgress
        variant="determinate"
        value={Math.min(value, 100)}
        sx={{
          flex: 1,
          backgroundColor: 'rgba(148, 168, 190, 0.12)',
          '& .MuiLinearProgress-bar': { backgroundColor: color },
        }}
      />
      <Typography variant="mono" component="span" sx={{ fontSize: '0.75rem', color, minWidth: 32 }}>
        {value.toFixed(0)}
      </Typography>
    </Box>
  );
}
