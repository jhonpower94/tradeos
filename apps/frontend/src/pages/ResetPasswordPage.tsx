import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import Link from '@mui/joy/Link';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api';
import { AuthShell } from '../components/AuthShell';
import { PasswordField } from '../components/PasswordField';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Missing reset token');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setPending(true);
    try {
      await authApi.resetPassword(token, password);
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Reset failed',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Reset password" subtitle="Choose a new password for your account">
      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {!token && (
        <Alert color="warning" sx={{ mb: 2 }}>
          This link is missing a token. Request a new reset from the forgot password page.
        </Alert>
      )}
      <Box component="form" onSubmit={onSubmit} sx={{ display: 'grid', gap: 2 }}>
        <FormControl required>
          <FormLabel>New password</FormLabel>
          <PasswordField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <FormHelperText>Min 8 characters</FormHelperText>
        </FormControl>
        <FormControl required>
          <FormLabel>Confirm password</FormLabel>
          <PasswordField
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </FormControl>
        <Button type="submit" size="lg" loading={pending} disabled={!token}>
          Update password
        </Button>
      </Box>
      <FormHelperText sx={{ mt: 2, display: 'block' }}>
        <Link component={RouterLink} to="/login">
          Back to sign in
        </Link>
      </FormHelperText>
    </AuthShell>
  );
}
