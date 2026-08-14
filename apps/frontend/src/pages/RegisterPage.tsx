import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Link from '@mui/joy/Link';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuthStore } from '../stores/authStore';
import { AuthShell } from '../components/AuthShell';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const data = await authApi.register(email, password);
      setAuth(data.accessToken, data.user, data.refreshToken);
      navigate('/');
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Registration failed',
      );
    }
  }

  return (
    <AuthShell title="Create account" subtitle="Start paper trading in minutes">
      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box component="form" onSubmit={onSubmit} sx={{ display: 'grid', gap: 1.5 }}>
        <FormControl required>
          <FormLabel>Email</FormLabel>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormControl>
        <FormControl required>
          <FormLabel>Password</FormLabel>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <FormHelperText>Min 8 characters</FormHelperText>
        </FormControl>
        <Button type="submit" size="lg">
          Register
        </Button>
      </Box>
      <FormHelperText sx={{ mt: 2, display: 'block' }}>
        Have an account?{' '}
        <Link component={RouterLink} to="/login">
          Sign in
        </Link>
      </FormHelperText>
    </AuthShell>
  );
}
