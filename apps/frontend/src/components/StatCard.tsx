import Box from '@mui/joy/Box';
import Card from '@mui/joy/Card';
import Typography from '@mui/joy/Typography';
import type { ReactNode } from 'react';
import { monoSx } from '../theme/theme';

interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  tone?: 'positive' | 'negative' | 'neutral';
  icon?: ReactNode;
}

export function StatCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  tone = 'neutral',
  icon,
}: StatCardProps) {
  const toneColor =
    tone === 'positive' ? 'success.plainColor' : tone === 'negative' ? 'danger.plainColor' : 'text.primary';
  const deltaColor =
    deltaTone === 'positive'
      ? 'success.plainColor'
      : deltaTone === 'negative'
        ? 'danger.plainColor'
        : 'text.secondary';

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2.5,
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 1.5,
        boxShadow: 'none',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
        <Typography level="body-xs" sx={{ textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          {label}
        </Typography>
        {icon && <Box sx={{ color: 'text.tertiary', display: 'flex' }}>{icon}</Box>}
      </Box>
      <Typography
        level="h3"
        sx={{
          ...monoSx,
          color: toneColor,
          minWidth: 0,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Typography>
      {delta && (
        <Typography level="body-xs" sx={{ color: deltaColor, fontWeight: 600 }}>
          {delta}
        </Typography>
      )}
    </Card>
  );
}
