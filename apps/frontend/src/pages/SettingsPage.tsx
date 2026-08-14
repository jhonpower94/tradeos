import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Snackbar,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TIMEFRAMES } from '@trading-os/shared';
import { notificationsApi, settingsApi } from '../api';
import { disableWebPush, enableWebPush, getActivePushEndpoint } from '../lib/webPush';

/** Controlled number field: blur saves only when the value actually changed. */
function SettingsNumberField({
  label,
  value,
  onSave,
  helperText,
  inputProps,
}: {
  label: string;
  value: number;
  onSave: (n: number) => void;
  helperText?: string;
  inputProps?: React.ComponentProps<typeof TextField>['inputProps'];
}) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  return (
    <TextField
      label={label}
      type="number"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = Number(local);
        if (!Number.isFinite(n) || n === value) {
          setLocal(String(value));
          return;
        }
        onSave(n);
      }}
      helperText={helperText}
      inputProps={{ step: 'any', ...inputProps }}
    />
  );
}

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

  const msgSeverity = /ok|saved|sent|connection ok|enabled|disabled|active/i.test(msg)
    ? 'success'
    : 'error';

  const saveBinance = useMutation({
    mutationFn: () =>
      settingsApi.setBinance({ apiKey, apiSecret, testnet: data?.binance?.testnet ?? false }),
    onSuccess: (next) => {
      setMsg('Binance keys saved');
      qc.setQueryData(['settings'], next);
    },
  });
  const testBinance = useMutation({
    mutationFn: settingsApi.testBinance,
    onSuccess: (r) => setMsg(`Connection OK — ${r.assets} assets`),
    onError: (e: unknown) =>
      setMsg(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Test failed',
      ),
  });
  const saveSettings = useMutation({
    mutationFn: (body: unknown) => settingsApi.update(body),
    onSuccess: (next) => {
      setMsg('Settings saved');
      qc.setQueryData(['settings'], next);
    },
    onError: (e: unknown) =>
      setMsg(
        (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ??
          (e as Error)?.message ??
          'Failed to save settings',
      ),
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
      <Snackbar
        open={Boolean(msg)}
        autoHideDuration={4000}
        onClose={() => setMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        disableWindowBlurListener
      >
        <Alert
          severity={msgSeverity}
          onClose={() => setMsg('')}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {msg}
        </Alert>
      </Snackbar>
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
            blocked on your network — use a VPN or set BINANCE_REST_URL in .env (e.g.
            https://api1.binance.com).
          </Typography>
          <TextField label="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <TextField
            label="API Secret"
            type="password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              onClick={() => saveBinance.mutate()}
              disabled={!apiKey || !apiSecret}
            >
              Save keys
            </Button>
            <Button
              variant="outlined"
              onClick={() => testBinance.mutate()}
              disabled={!data?.binance?.configured}
            >
              Test connection
            </Button>
          </Box>
        </Paper>
      )}

      {tab === 1 && data && (
        <Paper sx={{ p: 2, display: 'grid', gap: 2, maxWidth: 480 }}>
          <SettingsNumberField
            label="Max risk per trade"
            value={Number(data.risk?.maxRiskPerTrade ?? 0.01)}
            inputProps={{ min: 0.001, max: 0.1 }}
            onSave={(n) => saveSettings.mutate({ risk: { maxRiskPerTrade: n } })}
            helperText="Fraction of equity (0.01 = 1%, 0.09 = 9%)."
          />
          <SettingsNumberField
            label="Max daily loss"
            value={Number(data.risk?.maxDailyLoss ?? 0.05)}
            inputProps={{ min: 0.01, max: 0.5 }}
            onSave={(n) => saveSettings.mutate({ risk: { maxDailyLoss: n } })}
            helperText="Fraction of equity (0.05 = 5%)."
          />
          <SettingsNumberField
            label="Max open positions"
            value={Number(data.risk?.maxOpenPositions ?? 5)}
            inputProps={{ min: 1, max: 50 }}
            onSave={(n) => saveSettings.mutate({ risk: { maxOpenPositions: n } })}
          />
          <SettingsNumberField
            label="Min risk/reward"
            value={Number(data.risk?.minRiskReward ?? 2)}
            inputProps={{ min: 0.5, max: 10 }}
            onSave={(n) => saveSettings.mutate({ risk: { minRiskReward: n } })}
          />
          <SettingsNumberField
            label="Max % of free balance per trade"
            value={Number(data.risk?.maxFreeNotionalPct ?? 0.25)}
            inputProps={{ min: 0.05, max: 1 }}
            onSave={(n) => saveSettings.mutate({ risk: { maxFreeNotionalPct: n } })}
            helperText="Fraction of free USDT (1 = 100%, 0.25 = 25%). Range 0.05–1."
          />
        </Paper>
      )}

      {tab === 2 && data && (
        <Paper sx={{ p: 2, display: 'grid', gap: 2, maxWidth: 480 }}>
          <TextField
            select
            label="Trading mode"
            value={data.trading?.mode ?? 'paper'}
            onChange={(e) => {
              if (e.target.value === data.trading?.mode) return;
              saveSettings.mutate({ trading: { mode: e.target.value } });
            }}
          >
            <MenuItem value="paper">Paper</MenuItem>
            <MenuItem value="live">Live</MenuItem>
          </TextField>
          <TextField
            select
            label="Approval mode"
            value={data.trading?.approval ?? 'manual'}
            onChange={(e) => {
              if (e.target.value === data.trading?.approval) return;
              saveSettings.mutate({ trading: { approval: e.target.value } });
            }}
          >
            <MenuItem value="manual">Manual</MenuItem>
            <MenuItem value="semi">Semi automatic</MenuItem>
            <MenuItem value="auto">Automatic</MenuItem>
          </TextField>
          <SettingsNumberField
            label="Paper starting balance (USDT)"
            value={Number(data.trading?.paperStartingBalance ?? 10000)}
            inputProps={{ min: 0 }}
            onSave={(n) => saveSettings.mutate({ trading: { paperStartingBalance: n } })}
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
          <SettingsNumberField
            label="Partial TP fraction"
            value={Number(data.trading?.partialTpFraction ?? 0.33)}
            inputProps={{ min: 0.05, max: 0.95 }}
            onSave={(n) => saveSettings.mutate({ trading: { partialTpFraction: n } })}
            helperText="Fraction of size to close at the R trigger (e.g. 0.33 = 33%)."
          />
          <SettingsNumberField
            label="Partial TP at R"
            value={Number(data.trading?.partialTpAtR ?? 1.5)}
            inputProps={{ min: 0.25 }}
            onSave={(n) => saveSettings.mutate({ trading: { partialTpAtR: n } })}
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
          <SettingsNumberField
            label="Trailing stop %"
            value={Number(data.trading?.trailingStopPct ?? 1.5)}
            inputProps={{ min: 0.1 }}
            onSave={(n) => saveSettings.mutate({ trading: { trailingStopPct: n } })}
          />
          <SettingsNumberField
            label="Trail activate at R"
            value={Number(data.trading?.trailingActivateAtR ?? 1.5)}
            inputProps={{ min: 0.25 }}
            onSave={(n) => saveSettings.mutate({ trading: { trailingActivateAtR: n } })}
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
          <SettingsNumberField
            label="Max adverse R"
            value={Number(data.trading?.maxAdverseR ?? 0.75)}
            inputProps={{ min: 0.1, max: 2 }}
            onSave={(n) => saveSettings.mutate({ trading: { maxAdverseR: n } })}
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
          <SettingsNumberField
            label="Max hold (hours)"
            value={
              data.trading?.maxHoldMs != null
                ? data.trading.maxHoldMs / (60 * 60 * 1000)
                : 6
            }
            inputProps={{ min: 1 / 60, max: 168 }}
            onSave={(n) =>
              saveSettings.mutate({ trading: { maxHoldMs: n * 60 * 60 * 1000 } })
            }
            helperText="Close if still below min progress R after this many hours."
          />
          <SettingsNumberField
            label="Min progress R (time stop)"
            value={Number(data.trading?.minProgressR ?? 0.3)}
            inputProps={{ min: 0, max: 1 }}
            onSave={(n) => saveSettings.mutate({ trading: { minProgressR: n } })}
          />
        </Paper>
      )}

      {tab === 3 && data && (
        <Paper sx={{ p: 2, display: 'grid', gap: 2, maxWidth: 480 }}>
          <TextField
            select
            label="Scan timeframes"
            SelectProps={{ multiple: true }}
            value={data.scanner?.timeframes ?? ['15m', '1h', '4h']}
            onChange={(e) => {
              const raw = e.target.value;
              const next = typeof raw === 'string' ? raw.split(',') : raw;
              if (!next.length) return;
              const prev = data.scanner?.timeframes ?? ['15m', '1h', '4h'];
              if (next.length === prev.length && next.every((t, i) => t === prev[i])) return;
              saveSettings.mutate({ scanner: { timeframes: next } });
            }}
            helperText="Prefer one family (e.g. 1h + 4h). Mixed 15m + 4h often conflicts."
          >
            {TIMEFRAMES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <SettingsNumberField
            label="Min confidence"
            value={Number(data.scanner?.minConfidence ?? 75)}
            onSave={(n) => saveSettings.mutate({ scanner: { minConfidence: n } })}
          />
          <SettingsNumberField
            label="Min aligned strategies"
            value={Number(data.scanner?.minAlignedStrategies ?? 2)}
            onSave={(n) => saveSettings.mutate({ scanner: { minAlignedStrategies: n } })}
          />
          <SettingsNumberField
            label="Min agreement ratio"
            value={Number(data.scanner?.minAgreementRatio ?? 0.6)}
            inputProps={{ min: 0, max: 1 }}
            onSave={(n) => saveSettings.mutate({ scanner: { minAgreementRatio: n } })}
          />
          <SettingsNumberField
            label="Hot set size"
            value={Number(data.scanner?.hotSetSize ?? 50)}
            onSave={(n) => saveSettings.mutate({ scanner: { hotSetSize: n } })}
          />
          <SettingsNumberField
            label="Concurrency"
            value={Number(data.scanner?.concurrency ?? 5)}
            onSave={(n) => saveSettings.mutate({ scanner: { concurrency: n } })}
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
            When enabled, only strategies designed for the detected regime (trending / ranging /
            volatile) are evaluated. Unknown regime skips trading. Counter-trend sides are vetoed in
            strong trends.
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
            Configure Telegram / Discord / Email via environment and settings API. Browser
            notifications are enabled by default.
          </Typography>
          <Typography variant="subtitle2">Web Push (per-trade profit highs)</Typography>
          <Typography variant="caption" color="text.secondary">
            Works with the tab closed. Requires HTTPS or localhost, and VAPID keys (
            <code>npm run setup:vapid</code> once). Alerts fire when an open trade&apos;s uPnL sets a
            new high at least $1 above its previous peak.
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
