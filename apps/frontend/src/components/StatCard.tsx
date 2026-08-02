import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useTheme } from '@mui/material/styles';

interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  icon?: ReactNode;
}

export function StatCard({ label, value, delta, deltaTone = 'neutral', icon }: StatCardProps) {
  const theme = useTheme();
  const deltaColor =
    deltaTone === 'positive'
      ? theme.palette.long.light
      : deltaTone === 'negative'
        ? theme.palette.short.light
        : theme.palette.text.secondary;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">{label}</Typography>
        {icon && (
          <Box sx={{ color: theme.palette.text.secondary, display: 'flex' }}>{icon}</Box>
        )}
      </Box>
      <Typography variant="h4" sx={{ fontFamily: theme.typography.mono.fontFamily }}>
        {value}
      </Typography>
      {delta && (
        <Typography variant="caption" sx={{ color: deltaColor, fontWeight: 600 }}>
          {delta}
        </Typography>
      )}
    </Paper>
  );
}
