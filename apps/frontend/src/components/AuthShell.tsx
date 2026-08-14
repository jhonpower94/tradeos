import Box from '@mui/joy/Box';
import Card from '@mui/joy/Card';
import Typography from '@mui/joy/Typography';
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
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 4,
        backgroundImage:
          'radial-gradient(circle at 20% 20%, rgba(45, 212, 167, 0.08), transparent 45%), radial-gradient(circle at 80% 80%, rgba(79, 163, 227, 0.08), transparent 45%)',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 3.5, justifyContent: 'center' }}>
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
          <Typography level="title-lg" sx={{ fontFamily: 'var(--joy-fontFamily-code)', letterSpacing: 0.5 }}>
            TRADING OS
          </Typography>
        </Box>

        <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, boxShadow: 'none' }}>
          <Typography level="h3" sx={{ mb: 0.5 }}>
            {title}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 3 }}>
            {subtitle}
          </Typography>
          {children}
        </Card>
      </Box>
    </Box>
  );
}
