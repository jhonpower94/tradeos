import { useMemo, useState, type ReactNode } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { settingsApi, subscriptionApi } from '../api';
import { ColorModeToggle } from '../components/ColorModeToggle';

type Plan = {
  id: string;
  name: string;
  priceUsdt: number;
  durationDays: number;
  active?: boolean;
};

function startingAtUsdtMonthly(plans: Plan[]): number | null {
  const rates = plans
    .filter((p) => Number(p.priceUsdt) > 0 && Number(p.durationDays) > 0)
    .map((p) => (Number(p.priceUsdt) / Number(p.durationDays)) * 30);
  if (!rates.length) return null;
  return Math.round(Math.min(...rates));
}

function errMsg(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message ?? e?.message ?? 'Request failed';
}

export function GetStartedPage() {
  const qc = useQueryClient();
  const [picking, setPicking] = useState<'demo' | 'live' | null>(null);
  const [error, setError] = useState('');

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const { data: plansData } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: subscriptionApi.plans,
  });

  const plans: Plan[] = plansData?.plans ?? plansData?.items ?? [];
  const startingAt = useMemo(() => startingAtUsdtMonthly(plans), [plans]);

  const choose = useMutation({
    mutationFn: async (path: 'demo' | 'live') => {
      const updated = await settingsApi.update({ onboarding: { tradingPathChosen: true } });
      if (updated?.onboarding?.tradingPathChosen !== true) {
        throw new Error('Could not save your choice. Please try again.');
      }
      return { path, updated };
    },
    onSuccess: ({ updated }) => {
      qc.setQueryData(['settings'], updated);
    },
    onError: (err) => {
      setError(errMsg(err));
      setPicking(null);
    },
  });

  if (settingsLoading) {
    return (
      <ChooserShell>
        <Typography level="body-md" sx={{ color: 'text.secondary', textAlign: 'center' }}>
          Loading…
        </Typography>
      </ChooserShell>
    );
  }

  // After a successful choose, settings flip to chosen — route by the pick, not always home.
  if (settings?.onboarding?.tradingPathChosen !== false) {
    if (picking === 'live') {
      return <Navigate to="/subscription" replace />;
    }
    return <Navigate to="/" replace />;
  }

  const busy = choose.isPending;

  function onPick(path: 'demo' | 'live') {
    setError('');
    setPicking(path);
    choose.mutate(path);
  }

  return (
    <ChooserShell>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography level="h2" sx={{ mb: 1 }}>
          How do you want to trade?
        </Typography>
        <Typography level="body-md" sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto' }}>
          Choose demo practice with paper funds, or subscribe for live exchange trading.
        </Typography>
      </Box>

      {error && (
        <Alert color="danger" sx={{ mb: 2, maxWidth: 720, mx: 'auto' }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 2.5,
          maxWidth: 720,
          mx: 'auto',
          width: '100%',
        }}
      >
        <Card
          variant="outlined"
          sx={{
            p: 3,
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            cursor: busy ? 'default' : 'pointer',
            transition: 'border-color 0.15s, transform 0.15s',
            '&:hover': busy
              ? undefined
              : { borderColor: 'primary.outlinedColor', transform: 'translateY(-2px)' },
          }}
          onClick={() => {
            if (!busy) void onPick('demo');
          }}
        >
          <Typography level="title-lg">Demo</Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary', flex: 1 }}>
            Practice with paper trading — no payment required. Switch to live anytime from Settings.
          </Typography>
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            Free
          </Typography>
          <Button
            size="lg"
            variant="solid"
            color="neutral"
            loading={picking === 'demo' && busy}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void onPick('demo');
            }}
          >
            Start with Demo
          </Button>
        </Card>

        <Card
          variant="outlined"
          sx={{
            p: 3,
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            cursor: busy ? 'default' : 'pointer',
            borderColor: 'primary.outlinedBorder',
            transition: 'border-color 0.15s, transform 0.15s',
            '&:hover': busy
              ? undefined
              : { borderColor: 'primary.outlinedColor', transform: 'translateY(-2px)' },
          }}
          onClick={() => {
            if (!busy) void onPick('live');
          }}
        >
          <Typography level="title-lg">Live</Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary', flex: 1 }}>
            Trade on your exchange with real funds after an active subscription.
          </Typography>
          <Typography level="body-sm" sx={{ fontWeight: 600, color: 'primary.plainColor' }}>
            {startingAt != null
              ? `Subscription starting at ${startingAt} USDT / month`
              : 'Subscription required for live trading'}
          </Typography>
          <Button
            size="lg"
            variant="solid"
            color="primary"
            loading={picking === 'live' && busy}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void onPick('live');
            }}
          >
            Continue to Live
          </Button>
        </Card>
      </Box>
    </ChooserShell>
  );
}

function ChooserShell({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
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
      <Box sx={{ width: '100%', maxWidth: 800 }}>
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
        {children}
      </Box>
    </Box>
  );
}
