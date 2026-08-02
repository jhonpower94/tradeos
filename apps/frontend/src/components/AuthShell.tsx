import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        backgroundImage:
          'radial-gradient(circle at 20% 20%, rgba(45, 212, 167, 0.08), transparent 45%), radial-gradient(circle at 80% 80%, rgba(79, 163, 227, 0.08), transparent 45%)',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 400 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 4, justifyContent: 'center' }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2DD4A7, #4FA3E3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem',
              color: '#04120D',
            }}
          >
            TO
          </Box>
          <Typography variant="h5" sx={{ fontFamily: '"IBM Plex Mono", monospace', letterSpacing: 0.5 }}>
            TRADING OS
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 4 }}>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {subtitle}
          </Typography>
          {children}
        </Paper>
      </Box>
    </Box>
  );
}
