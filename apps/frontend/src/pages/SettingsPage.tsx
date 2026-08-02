import { useState } from 'react';
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

export function SettingsPage() {
  const [tab, setTab] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [msg, setMsg] = useState('');
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });

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
    onSuccess: () => setMsg('Test notification sent'),
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
            Configure Telegram / Discord / Email via environment and settings API. Browser notifications are enabled by default.
          </Typography>
          <Button variant="contained" onClick={() => testNotify.mutate()}>
            Send test notification
          </Button>
        </Paper>
      )}
    </Box>
  );
}
