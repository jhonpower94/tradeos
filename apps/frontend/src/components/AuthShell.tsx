import Box from '@mui/joy/Box';
import Card from '@mui/joy/Card';
import Typography from '@mui/joy/Typography';
import type { ReactNode } from 'react';
import { ColorModeToggle } from './ColorModeToggle';

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
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2.5,
        py: 5,
        bgcolor: 'background.body',
        backgroundImage:
          'radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--joy-palette-primary-500) 16%, transparent), transparent 42%), radial-gradient(circle at 86% 92%, color-mix(in srgb, var(--joy-palette-success-500) 12%, transparent), transparent 40%)',
      }}
    >
      <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
        <ColorModeToggle />
      </Box>
      <Box sx={{ width: '100%', maxWidth: 440 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4, justifyContent: 'center' }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb, #0D9F6E)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem',
              color: '#F7FBFD',
            }}
          >
            TO
          </Box>
          <Typography level="title-lg" sx={{ fontFamily: 'var(--joy-fontFamily-code)', letterSpacing: 0.6 }}>
            TRADING OS
          </Typography>
        </Box>

        <Card variant="outlined" sx={{ p: { xs: 3, sm: 4.5 }, boxShadow: 'none' }}>
          <Typography level="h3" sx={{ mb: 0.75 }}>
            {title}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 3.5 }}>
            {subtitle}
          </Typography>
          {children}
        </Card>
      </Box>
    </Box>
  );
}
