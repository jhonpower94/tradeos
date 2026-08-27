import { useEffect, useState } from 'react';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Snackbar from '@mui/joy/Snackbar';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { notificationsApi } from '../api';
import {
  enableWebPush,
  getActivePushEndpoint,
  isIosDevice,
  isPushApiAvailable,
  isStandaloneDisplay,
  pushUnsupportedReason,
} from '../lib/webPush';
import { InstallAppButton } from './InstallAppButton';
import { useAuthStore } from '../stores/authStore';

function dismissKey(userId: string) {
  return `trading-os-push-prompt-dismissed:${userId}`;
}

function isDismissed(userId: string) {
  try {
    return localStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

function setDismissed(userId: string) {
  try {
    localStorage.setItem(dismissKey(userId), '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export function EnableNotificationsBanner() {
  const userId = useAuthStore((s) => s.user?.id);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const unsupported = pushUnsupportedReason();
  const needsIosInstall = isIosDevice() && !isStandaloneDisplay();
  const canEnableInline = isPushApiAvailable() && !needsIosInstall;

  useEffect(() => {
    if (!userId) {
      setReady(true);
      setVisible(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      if (isDismissed(userId)) {
        if (!cancelled) {
          setVisible(false);
          setReady(true);
        }
        return;
      }

      // Unsupported / iOS-in-browser: still show guidance banner
      if (unsupported || needsIosInstall) {
        if (!cancelled) {
          setVisible(true);
          setReady(true);
        }
        return;
      }

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const endpoint = await getActivePushEndpoint();
        if (!cancelled) {
          setVisible(!endpoint);
          setReady(true);
        }
        return;
      }

      if (!cancelled) {
        setVisible(true);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, unsupported, needsIosInstall]);

  const enable = useMutation({
    mutationFn: () =>
      enableWebPush({
        getPublicKey: async () => {
          const r = await notificationsApi.vapidPublicKey();
          return r.publicKey;
        },
        subscribe: (sub) => notificationsApi.pushSubscribe(sub),
      }),
    onSuccess: () => {
      setError('');
      setVisible(false);
      setSuccessMsg('Notifications enabled');
    },
    onError: (e: unknown) => {
      setError(
        (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ??
          (e as Error)?.message ??
          'Failed to enable notifications',
      );
    },
  });

  const dismiss = () => {
    if (userId) setDismissed(userId);
    setVisible(false);
  };

  const body = needsIosInstall
    ? 'On iPhone/iPad, add Trading OS to your Home Screen, then enable notifications.'
    : unsupported
      ? unsupported
      : 'Get trade and signal alerts even when this tab is closed.';

  return (
    <>
      {ready && visible ? (
        <Sheet
          variant="outlined"
          sx={{
            mb: 3,
            px: { xs: 2, sm: 2.5 },
            py: { xs: 1.75, sm: 2 },
            borderRadius: 'lg',
            borderLeft: '3px solid',
            borderLeftColor: 'primary.500',
            bgcolor: 'background.level1',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box sx={{ minWidth: 0, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Box
              sx={{
                mt: 0.25,
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: 'md',
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'primary.softBg',
                color: 'primary.plainColor',
              }}
            >
              <NotificationsOutlined fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography level="title-sm" sx={{ mb: 0.25 }}>
                Enable notifications
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                {body}
              </Typography>
              {error ? (
                <Typography level="body-xs" sx={{ color: 'danger.500', mt: 0.75 }}>
                  {error}
                </Typography>
              ) : null}
            </Box>
          </Box>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexShrink: 0,
              flexWrap: 'wrap',
              alignSelf: { xs: 'flex-start', sm: 'center' },
              pl: { xs: 6.5, sm: 0 },
            }}
          >
            <Button size="sm" variant="plain" color="neutral" onClick={dismiss}>
              Not now
            </Button>
            {canEnableInline ? (
              <Button
                size="sm"
                variant="soft"
                color="primary"
                loading={enable.isPending}
                onClick={() => {
                  setError('');
                  enable.mutate();
                }}
              >
                Enable
              </Button>
            ) : needsIosInstall ? (
              <InstallAppButton size="sm" variant="soft" color="primary" />
            ) : (
              <Button
                component={RouterLink}
                to="/settings?tab=5"
                size="sm"
                variant="soft"
                color="primary"
              >
                Open Settings
              </Button>
            )}
          </Box>
        </Sheet>
      ) : null}
      <Snackbar
        open={Boolean(successMsg)}
        autoHideDuration={3000}
        onClose={() => setSuccessMsg('')}
        color="success"
        variant="solid"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 8, md: 0 } }}
      >
        {successMsg}
      </Snackbar>
    </>
  );
}
