import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, settingsApi } from '../api';
import { disableWebPush, enableWebPush, getActivePushEndpoint } from '../lib/webPush';

export function SettingsPage() {
  const [tab, setTab] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [msg, setMsg] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });

  useEffect(() => {
    void getActivePushEndpoint().then((ep) => setPushEnabled(Boolean(ep)));
  }, [tab]);

  const saveBinance = useMutation({
    mutationFn: () => settingsApi.setBinance({ apiKey, apiSecret, testnet: data?.binance?.testnet ?? false }),
    onSuccess: () => {
      setMsg('Binance keys saved');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  const testBinance = useMutation({
    mutationFn: settingsApi.testBinance,
    onSuccess: (r) => setMsg(`Connection OK — ${r.assets} assets`),
    onError: (e: unknown) =>
      setMsg((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Test failed'),
  });
  const saveSettings = useMutation({
    mutationFn: (body: unknown) => settingsApi.update(body),
    onSuccess: () => {
      setMsg('Settings saved');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  const testNotify = useMutation({
    mutationFn: notificationsApi.test,
    onSuccess: (r) =>
      setMsg(
        r?.webPushConfigured
          ? 'Test notification sent (Web Push + in-app)'
          : 'Test notification sent (in-app only — run setup:vapid for Web Push)',
      ),
  });
  const enablePush = useMutation({
    mutationFn: () =>
      enableWebPush({
        getPublicKey: async () => {
          const r = await notificationsApi.vapidPublicKey();
          return r.publicKey;
        },
        subscribe: (sub) => notificationsApi.pushSubscribe(sub),
      }),
    onSuccess: () => {
      setPushEnabled(true);
      setMsg('Web Push enabled — alerts work with the tab closed');
    },
    onError: (e: unknown) =>
      setMsg(
        (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ??
          (e as Error)?.message ??
          'Failed to enable Web Push',
      ),
  });
  const disablePush = useMutation({
    mutationFn: () =>
      disableWebPush({
        unsubscribe: (endpoint) => notificationsApi.pushUnsubscribe(endpoint),
      }),
    onSuccess: () => {
      setPushEnabled(false);
      setMsg('Web Push disabled');
    },
    onError: (e: unknown) => setMsg((e as Error)?.message ?? 'Failed to disable Web Push'),
  });

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Settings
      </Typography>
      {msg && (
        <Alert
          sx={{ mb: 2 }}
          severity={/ok|saved|sent|connection ok/i.test(msg) ? 'success' : 'error'}
          onClose={() => setMsg('')}
        >
          {msg}
        </Alert>
      )}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Binance" />
          <Tab label="Risk" />
          <Tab label="Trading" />
          <Tab label="Scanner" />
          <Tab label="Notifications" />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <Paper sx={{ p: 2, display: 'grid', gap: 2, maxWidth: 480 }}>
          <Typography variant="body2">
            Status: {data?.binance?.configured ? 'Configured' : 'Not configured'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Test calls Binance account API. If you see ENOTFOUND / unreachable, api.binance.com may be
            blocked on your network — use a VPN or set BINANCE_REST_URL in .env (e.g. https://api1.binance.com).
          </Typography>
          <TextField label="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <TextField label="API Secret" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" onClick={() => saveBinance.mutate()} disabled={!apiKey || !apiSecret}>
              Save keys
            </Button>
            <Button variant="outlined" onClick={() => testBinance.mutate()} disabled={!data?.binance?.configured}>
              Test connection
            </Button>
          </Box>
        </Paper>
      )}

      {tab === 1 && data && (
        <Paper sx={{ p: 2, display: 'grid', gap: 2, maxWidth: 480 }}>
          <TextField
            label="Max risk per trade"
            type="number"
            defaultValue={data.risk?.maxRiskPerTrade}
            onBlur={(e) => saveSettings.mutate({ risk: { maxRiskPerTrade: Number(e.target.value) } })}
          />
          <TextField
            label="Max daily loss"
            type="number"
            defaultValue={data.risk?.maxDailyLoss}
            onBlur={(e) => saveSettings.mutate({ risk: { maxDailyLoss: Number(e.target.value) } })}
          />
          <TextField
            label="Max open positions"
            type="number"
            defaultValue={data.risk?.maxOpenPositions}
            onBlur={(e) => saveSettings.mutate({ risk: { maxOpenPositions: Number(e.target.value) } })}
          />
          <TextField
            label="Min risk/reward"
            type="number"
            defaultValue={data.risk?.minRiskReward}
            onBlur={(e) => saveSettings.mutate({ risk: { minRiskReward: Number(e.target.value) } })}
          />
          <TextField
            label="Max % of free balance per trade"
            type="number"
            inputProps={{ step: 0.05, min: 0.05, max: 1 }}
            defaultValue={data.risk?.maxFreeNotionalPct ?? 0.25}
            onBlur={(e) =>
              saveSettings.mutate({ risk: { maxFreeNotionalPct: Number(e.target.value) } })
            }
            helperText="Caps entry notional to this fraction of free USDT (e.g. 0.25 = 25%)."
          />
        </Paper>
      )}

      {tab === 2 && data && (
        <Paper sx={{ p: 2, display: 'grid', gap: 2, maxWidth: 480 }}>
          <TextField
            select
            label="Trading mode"
            defaultValue={data.trading?.mode}
            onChange={(e) => saveSettings.mutate({ trading: { mode: e.target.value } })}
          >
            <MenuItem value="paper">Paper</MenuItem>
            <MenuItem value="live">Live</MenuItem>
          </TextField>
          <TextField
            select
            label="Approval mode"
            defaultValue={data.trading?.approval}
            onChange={(e) => saveSettings.mutate({ trading: { approval: e.target.value } })}
          >
            <MenuItem value="manual">Manual</MenuItem>
            <MenuItem value="semi">Semi automatic</MenuItem>
            <MenuItem value="auto">Automatic</MenuItem>
          </TextField>
          <TextField
            label="Paper starting balance (USDT)"
            type="number"
            defaultValue={data.trading?.paperStartingBalance ?? 10000}
            onBlur={(e) =>
              saveSettings.mutate({ trading: { paperStartingBalance: Number(e.target.value) } })
            }
            helperText="Baseline paper funding. Realized PnL and deposits/withdrawals stack on top."
          />
          <FormControlLabel
            control={
              <Switch
                checked={data.trading?.partialTpEnabled ?? true}
                onChange={(e) =>
                  saveSettings.mutate({ trading: { partialTpEnabled: e.target.checked } })
                }
              />
            }
            label="Partial take profit"
          />
          <TextField
            label="Partial TP fraction"
            type="number"
            inputProps={{ step: 0.05, min: 0.05, max: 0.95 }}
            defaultValue={data.trading?.partialTpFraction ?? 0.33}
            onBlur={(e) =>
              saveSettings.mutate({ trading: { partialTpFraction: Number(e.target.value) } })
            }
            helperText="Fraction of size to close at the R trigger (e.g. 0.33 = 33%)."
          />
          <TextField
            label="Partial TP at R"
            type="number"
            inputProps={{ step: 0.25, min: 0.25 }}
            defaultValue={data.trading?.partialTpAtR ?? 1.5}
            onBlur={(e) =>
              saveSettings.mutate({ trading: { partialTpAtR: Number(e.target.value) } })
            }
          />
          <FormControlLabel
            control={
              <Switch
                checked={data.trading?.breakevenOnPartial ?? true}
                onChange={(e) =>
                  saveSettings.mutate({ trading: { breakevenOnPartial: e.target.checked } })
                }
              />
            }
            label="Move SL to breakeven after partial"
          />
          <FormControlLabel
            control={
              <Switch
                checked={data.trading?.trailingEnabled ?? true}
                onChange={(e) =>
                  saveSettings.mutate({ trading: { trailingEnabled: e.target.checked } })
                }
              />
            }
            label="Trailing stop"
          />
          <TextField
            label="Trailing stop %"
            type="number"
            inputProps={{ step: 0.1, min: 0.1 }}
            defaultValue={data.trading?.trailingStopPct ?? 1.5}
            onBlur={(e) =>
              saveSettings.mutate({ trading: { trailingStopPct: Number(e.target.value) } })
            }
          />
          <TextField
            label="Trail activate at R"
            type="number"
            inputProps={{ step: 0.25, min: 0.25 }}
            defaultValue={data.trading?.trailingActivateAtR ?? 1.5}
            onBlur={(e) =>
              saveSettings.mutate({ trading: { trailingActivateAtR: Number(e.target.value) } })
            }
            helperText="Arm trailing once price reaches this R-multiple (even if partial TP is off)."
          />
          <FormControlLabel
            control={
              <Switch
                checked={data.trading?.adverseREnabled ?? true}
                onChange={(e) =>
                  saveSettings.mutate({ trading: { adverseREnabled: e.target.checked } })
                }
              />
            }
            label="Adverse R early exit"
          />
          <TextField
            label="Max adverse R"
            type="number"
            inputProps={{ step: 0.05, min: 0.1, max: 2 }}
            defaultValue={data.trading?.maxAdverseR ?? 0.75}
            onBlur={(e) =>
              saveSettings.mutate({ trading: { maxAdverseR: Number(e.target.value) } })
            }
            helperText="Close when R falls to −this value (before full stop)."
          />
          <FormControlLabel
            control={
              <Switch
                checked={data.trading?.timeStopEnabled ?? true}
                onChange={(e) =>
                  saveSettings.mutate({ trading: { timeStopEnabled: e.target.checked } })
                }
              />
            }
            label="Time stop"
          />
          <TextField
            label="Max hold (hours)"
            type="number"
            inputProps={{ step: 0.5, min: 1 / 60, max: 168 }}
            defaultValue={
              data.trading?.maxHoldMs != null
                ? data.trading.maxHoldMs / (60 * 60 * 1000)
                : 6
            }
            onBlur={(e) =>
              saveSettings.mutate({
                trading: { maxHoldMs: Number(e.target.value) * 60 * 60 * 1000 },
              })
            }
            helperText="Close if still below min progress R after this many hours."
          />
          <TextField
            label="Min progress R (time stop)"
            type="number"
            inputProps={{ step: 0.05, min: 0, max: 1 }}
            defaultValue={data.trading?.minProgressR ?? 0.3}
            onBlur={(e) =>
              saveSettings.mutate({ trading: { minProgressR: Number(e.target.value) } })
            }
          />
        </Paper>
      )}

      {tab === 3 && data && (
        <Paper sx={{ p: 2, display: 'grid', gap: 2, maxWidth: 480 }}>
          <TextField
            label="Min confidence"
            type="number"
            defaultValue={data.scanner?.minConfidence}
            onBlur={(e) => saveSettings.mutate({ scanner: { minConfidence: Number(e.target.value) } })}
          />
          <TextField
            label="Min aligned strategies"
            type="number"
            defaultValue={data.scanner?.minAlignedStrategies ?? 2}
            onBlur={(e) =>
              saveSettings.mutate({ scanner: { minAlignedStrategies: Number(e.target.value) } })
            }
          />
          <TextField
            label="Min agreement ratio"
            type="number"
            inputProps={{ step: 0.05, min: 0, max: 1 }}
            defaultValue={data.scanner?.minAgreementRatio ?? 0.6}
            onBlur={(e) =>
              saveSettings.mutate({ scanner: { minAgreementRatio: Number(e.target.value) } })
            }
          />
          <TextField
            label="Hot set size"
            type="number"
            defaultValue={data.scanner?.hotSetSize}
            onBlur={(e) => saveSettings.mutate({ scanner: { hotSetSize: Number(e.target.value) } })}
          />
          <TextField
            label="Concurrency"
            type="number"
            defaultValue={data.scanner?.concurrency}
            onBlur={(e) => saveSettings.mutate({ scanner: { concurrency: Number(e.target.value) } })}
          />
          <FormControlLabel
            control={
              <Switch
                checked={data.regime?.enabled !== false}
                onChange={(e) => saveSettings.mutate({ regime: { enabled: e.target.checked } })}
              />
            }
            label="Filter strategies by market regime"
          />
          <Typography variant="caption" color="text.secondary">
            When enabled, only strategies designed for the detected regime (trending / ranging / volatile) are
            evaluated. Unknown regime skips trading. Counter-trend sides are vetoed in strong trends.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={data.scanner?.htfVetoEnabled !== false}
                onChange={(e) =>
                  saveSettings.mutate({ scanner: { htfVetoEnabled: e.target.checked } })
                }
              />
            }
            label="HTF trend hard veto"
          />
          <Typography variant="caption" color="text.secondary">
            Block BUY when the parent timeframe EMA50/200 is bearish (and vice versa for SELL).
          </Typography>
        </Paper>
      )}

      {tab === 4 && (
        <Paper sx={{ p: 2, display: 'grid', gap: 2, maxWidth: 480 }}>
          <Typography variant="body2">
            Configure Telegram / Discord / Email via environment and settings API. Browser notifications
            are enabled by default.
          </Typography>
          <Typography variant="subtitle2">Web Push (per-trade profit highs)</Typography>
          <Typography variant="caption" color="text.secondary">
            Works with the tab closed. Requires HTTPS or localhost, and VAPID keys (
            <code>npm run setup:vapid</code> once). Alerts fire when an open trade&apos;s uPnL sets a new
            high at least $1 above its previous peak.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {!pushEnabled ? (
              <Button
                variant="contained"
                disabled={enablePush.isPending}
                onClick={() => enablePush.mutate()}
              >
                Enable Web Push
              </Button>
            ) : (
              <Button
                variant="outlined"
                color="warning"
                disabled={disablePush.isPending}
                onClick={() => disablePush.mutate()}
              >
                Disable Web Push
              </Button>
            )}
            <Button variant="outlined" onClick={() => testNotify.mutate()}>
              Send test notification
            </Button>
          </Box>
          {pushEnabled && (
            <Typography variant="caption" color="success.main">
              Web Push is active on this device.
            </Typography>
          )}
        </Paper>
      )}
    </Box>
  );
}
