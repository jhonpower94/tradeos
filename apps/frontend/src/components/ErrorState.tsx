import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';

export function ErrorState({ message }: { message: string }) {
  return (
    <Box sx={{ py: 2 }}>
      <Alert color="danger" variant="outlined">
        {message}
      </Alert>
    </Box>
  );
}
