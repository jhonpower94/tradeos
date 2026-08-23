import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Link from '@mui/joy/Link';
import { Link as RouterLink } from 'react-router-dom';
import { authApi } from '../api';
import { AuthShell } from '../components/AuthShell';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Request failed',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Forgot password" subtitle="We'll email you a reset link">
      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {sent ? (
        <Alert color="success" sx={{ mb: 2 }}>
          If an account exists for that email, a reset link has been sent. Check your inbox.
        </Alert>
      ) : (
        <Box component="form" onSubmit={onSubmit} sx={{ display: 'grid', gap: 2 }}>
          <FormControl required>
            <FormLabel>Email</FormLabel>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormControl>
          <Button type="submit" size="lg" loading={pending}>
            Send reset link
          </Button>
        </Box>
      )}
      <FormHelperText sx={{ mt: 2, display: 'block' }}>
        <Link component={RouterLink} to="/login">
          Back to sign in
        </Link>
      </FormHelperText>
    </AuthShell>
  );
}
