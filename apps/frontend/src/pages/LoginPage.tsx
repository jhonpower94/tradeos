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
import { PasswordField } from '../components/PasswordField';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function finishAuth(data: {
    accessToken: string;
    refreshToken?: string;
    user: { id: string; email: string; role?: 'user' | 'admin'; totpEnabled?: boolean; subscription?: AuthUserSub };
  }) {
    setAuth(data.accessToken, data.user, data.refreshToken);
    navigate('/');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      if (mfaToken) {
        const data = await authApi.mfaVerify(mfaToken, mfaCode.trim());
        await finishAuth(data);
        return;
      }
      const data = await authApi.login(email, password);
      if (data?.mfaRequired && data?.mfaToken) {
        setMfaToken(data.mfaToken);
        return;
      }
      await finishAuth(data);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (mfaToken ? 'Invalid authenticator code' : 'Login failed'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title={mfaToken ? 'Authenticator code' : 'Sign in'}
      subtitle={mfaToken ? 'Enter the 6-digit code from your authenticator app' : 'Sign in to your terminal'}
    >
      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box component="form" onSubmit={onSubmit} sx={{ display: 'grid', gap: 2 }}>
        {mfaToken ? (
          <FormControl required>
            <FormLabel>TOTP code</FormLabel>
            <Input
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456"
              slotProps={{ input: { inputMode: 'numeric', autoComplete: 'one-time-code' } }}
            />
          </FormControl>
        ) : (
          <>
            <FormControl required>
              <FormLabel>Email</FormLabel>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormControl>
            <FormControl required>
              <FormLabel>Password</FormLabel>
              <PasswordField
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </FormControl>
          </>
        )}
        <Button type="submit" size="lg" loading={pending}>
          {mfaToken ? 'Verify' : 'Sign in'}
        </Button>
        {mfaToken && (
          <Button
            variant="plain"
            color="neutral"
            onClick={() => {
              setMfaToken(null);
              setMfaCode('');
              setError('');
            }}
          >
            Back
          </Button>
        )}
      </Box>
      {!mfaToken && (
        <>
          <FormHelperText sx={{ mt: 2, display: 'block' }}>
            <Link component={RouterLink} to="/forgot-password">
              Forgot password?
            </Link>
          </FormHelperText>
          <FormHelperText sx={{ mt: 1, display: 'block' }}>
            No account?{' '}
            <Link component={RouterLink} to="/register">
              Register
            </Link>
          </FormHelperText>
        </>
      )}
    </AuthShell>
  );
}

type AuthUserSub = {
  active: boolean;
  endsAt: string | null;
  planId: string | null;
} | null;
