import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        minHeight: { xs: '60dvh', md: '70dvh' },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        textAlign: 'center',
        px: 2,
      }}
    >
      <Typography level="h1" sx={{ fontFamily: 'var(--joy-fontFamily-code)', color: 'text.tertiary' }}>
        404
      </Typography>
      <Typography level="body-md" sx={{ color: 'text.secondary' }}>
        This page doesn&apos;t exist.
      </Typography>
      <Button onClick={() => navigate('/')}>Back to dashboard</Button>
    </Box>
  );
}
