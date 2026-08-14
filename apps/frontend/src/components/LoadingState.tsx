import Box from '@mui/joy/Box';
import CircularProgress from '@mui/joy/CircularProgress';
import Typography from '@mui/joy/Typography';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        py: 8,
        color: 'text.secondary',
      }}
    >
      <CircularProgress size="md" />
      <Typography level="body-sm">{label}</Typography>
    </Box>
  );
}
