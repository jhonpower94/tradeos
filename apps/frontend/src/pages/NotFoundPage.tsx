import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <Typography variant="h1" sx={{ fontFamily: '"IBM Plex Mono", monospace', color: 'text.secondary' }}>
        404
      </Typography>
      <Typography variant="body1" color="text.secondary">
        This page doesn&apos;t exist.
      </Typography>
      <Button variant="contained" onClick={() => navigate('/')}>
        Back to dashboard
      </Button>
    </Box>
  );
}
