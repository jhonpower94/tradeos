import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';

export function ErrorState({ message }: { message: string }) {
  return (
    <Box sx={{ py: 2 }}>
      <Alert severity="error" variant="outlined">
        {message}
      </Alert>
    </Box>
  );
}
