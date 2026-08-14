import { useEffect, useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Snackbar from '@mui/joy/Snackbar';
import Switch from '@mui/joy/Switch';
import Tab from '@mui/joy/Tab';
import TabList from '@mui/joy/TabList';
import Tabs from '@mui/joy/Tabs';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TIMEFRAMES } from '@trading-os/shared';
import { notificationsApi, settingsApi } from '../api';
import { disableWebPush, enableWebPush, getActivePushEndpoint } from '../lib/webPush';
import { PageHeader } from '../components/PageHeader';

function SettingsNumberField({
  label,
  value,
  onSave,
  helperText,
  min,
  max,
  step = 'any',
}: {
  label: string;
  value: number;
  onSave: (n: number) => void;
  helperText?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  return (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      <Input
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
        slotProps={{ input: { step, min, max } }}
      />
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <Box>
      <FormControl orientation="horizontal" sx={{ justifyContent: 'space-between', gap: 2 }}>
        <FormLabel sx={{ m: 0 }}>{label}</FormLabel>
        <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </FormControl>
      {hint && (
        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

const panelSx = {
  p: 2,
  display: 'grid',
  gap: 2,
  maxWidth: 520,
  borderRadius: 'md',
} as const;

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
    : 'danger';

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
      <PageHeader title="Settings" subtitle="Exchange, risk, scanner, and alerts" />
      <Snackbar
        open={Boolean(msg)}
        autoHideDuration={4000}
        onClose={() => setMsg('')}
        color={msgSeverity}
        variant="solid"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 8, md: 0 } }}
      >
        {msg}
      </Snackbar>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as number)}
        sx={{ mb: 2 }}
      >
        <TabList
          sx={{
            overflowX: 'auto',
            flexWrap: { xs: 'nowrap', md: 'wrap' },
          }}
        >
          <Tab>Binance</Tab>
          <Tab>Risk</Tab>
          <Tab>Trading</Tab>
          <Tab>Scanner</Tab>
          <Tab>Notifications</Tab>
        </TabList>
      </Tabs>

      {tab === 0 && (
        <Sheet variant="outlined" sx={panelSx}>
          <Typography level="body-sm">
            Status: {data?.binance?.configured ? 'Configured' : 'Not configured'}
          </Typography>
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            Test calls Binance account API. If you see ENOTFOUND / unreachable, api.binance.com may be
            blocked on your network — use a VPN or set BINANCE_REST_URL in .env (e.g.
            https://api1.binance.com).
          </Typography>
          <FormControl>
            <FormLabel>API Key</FormLabel>
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel>API Secret</FormLabel>
            <Input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button onClick={() => saveBinance.mutate()} disabled={!apiKey || !apiSecret}>
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
        </Sheet>
      )}

      {tab === 1 && data && (
        <Sheet variant="outlined" sx={panelSx}>
          <SettingsNumberField
            label="Max risk per trade"
            value={Number(data.risk?.maxRiskPerTrade ?? 0.01)}
            min={0.001}
            max={0.1}
            onSave={(n) => saveSettings.mutate({ risk: { maxRiskPerTrade: n } })}
            helperText="Fraction of equity (0.01 = 1%, 0.09 = 9%)."
          />
          <SettingsNumberField
            label="Max daily loss"
            value={Number(data.risk?.maxDailyLoss ?? 0.05)}
            min={0.01}
            max={0.5}
            onSave={(n) => saveSettings.mutate({ risk: { maxDailyLoss: n } })}
            helperText="Fraction of equity (0.05 = 5%)."
          />
          <SettingsNumberField
            label="Max open positions"
            value={Number(data.risk?.maxOpenPositions ?? 5)}
            min={1}
            max={50}
            onSave={(n) => saveSettings.mutate({ risk: { maxOpenPositions: n } })}
          />
          <SettingsNumberField
            label="Min risk/reward"
            value={Number(data.risk?.minRiskReward ?? 2)}
            min={0.5}
            max={10}
            onSave={(n) => saveSettings.mutate({ risk: { minRiskReward: n } })}
          />
          <SettingsNumberField
            label="Max % of free balance per trade"
            value={Number(data.risk?.maxFreeNotionalPct ?? 0.25)}
            min={0.05}
            max={1}
            onSave={(n) => saveSettings.mutate({ risk: { maxFreeNotionalPct: n } })}
            helperText="Fraction of free USDT (1 = 100%, 0.25 = 25%). Range 0.05–1."
          />
        </Sheet>
      )}

      {tab === 2 && data && (
        <Sheet variant="outlined" sx={panelSx}>
          <FormControl>
            <FormLabel>Trading mode</FormLabel>
            <Select
              value={data.trading?.mode ?? 'paper'}
              onChange={(_, value) => {
                if (!value || value === data.trading?.mode) return;
                saveSettings.mutate({ trading: { mode: value } });
              }}
            >
              <Option value="paper">Paper</Option>
              <Option value="live">Live</Option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>Approval mode</FormLabel>
            <Select
              value={data.trading?.approval ?? 'manual'}
              onChange={(_, value) => {
                if (!value || value === data.trading?.approval) return;
                saveSettings.mutate({ trading: { approval: value } });
              }}
            >
              <Option value="manual">Manual</Option>
              <Option value="semi">Semi automatic</Option>
              <Option value="auto">Automatic</Option>
            </Select>
          </FormControl>
          <SettingsNumberField
            label="Paper starting balance (USDT)"
            value={Number(data.trading?.paperStartingBalance ?? 10000)}
            min={0}
            onSave={(n) => saveSettings.mutate({ trading: { paperStartingBalance: n } })}
            helperText="Baseline paper funding. Realized PnL and deposits/withdrawals stack on top."
          />
          <SwitchRow
            label="Partial take profit"
            checked={data.trading?.partialTpEnabled ?? true}
            onChange={(checked) => saveSettings.mutate({ trading: { partialTpEnabled: checked } })}
          />
          <SettingsNumberField
            label="Partial TP fraction"
            value={Number(data.trading?.partialTpFraction ?? 0.33)}
            min={0.05}
            max={0.95}
            onSave={(n) => saveSettings.mutate({ trading: { partialTpFraction: n } })}
            helperText="Fraction of size to close at the R trigger (e.g. 0.33 = 33%)."
          />
          <SettingsNumberField
            label="Partial TP at R"
            value={Number(data.trading?.partialTpAtR ?? 1.5)}
            min={0.25}
            onSave={(n) => saveSettings.mutate({ trading: { partialTpAtR: n } })}
          />
          <SwitchRow
            label="Move SL to breakeven after partial"
            checked={data.trading?.breakevenOnPartial ?? true}
            onChange={(checked) => saveSettings.mutate({ trading: { breakevenOnPartial: checked } })}
          />
          <SwitchRow
            label="Trailing stop"
            checked={data.trading?.trailingEnabled ?? true}
            onChange={(checked) => saveSettings.mutate({ trading: { trailingEnabled: checked } })}
          />
          <SettingsNumberField
            label="Trailing stop %"
            value={Number(data.trading?.trailingStopPct ?? 1.5)}
            min={0.1}
            onSave={(n) => saveSettings.mutate({ trading: { trailingStopPct: n } })}
          />
          <SettingsNumberField
            label="Trail activate at R"
            value={Number(data.trading?.trailingActivateAtR ?? 1.5)}
            min={0.25}
            onSave={(n) => saveSettings.mutate({ trading: { trailingActivateAtR: n } })}
            helperText="Arm trailing once price reaches this R-multiple (even if partial TP is off)."
          />
          <SwitchRow
            label="Adverse R early exit"
            checked={data.trading?.adverseREnabled ?? true}
            onChange={(checked) => saveSettings.mutate({ trading: { adverseREnabled: checked } })}
          />
          <SettingsNumberField
            label="Max adverse R"
            value={Number(data.trading?.maxAdverseR ?? 0.75)}
            min={0.1}
            max={2}
            onSave={(n) => saveSettings.mutate({ trading: { maxAdverseR: n } })}
            helperText="Close when R falls to −this value (before full stop)."
          />
          <SwitchRow
            label="Time stop"
            checked={data.trading?.timeStopEnabled ?? true}
            onChange={(checked) => saveSettings.mutate({ trading: { timeStopEnabled: checked } })}
          />
          <SettingsNumberField
            label="Max hold (hours)"
            value={
              data.trading?.maxHoldMs != null ? data.trading.maxHoldMs / (60 * 60 * 1000) : 6
            }
            min={1 / 60}
            max={168}
            onSave={(n) => saveSettings.mutate({ trading: { maxHoldMs: n * 60 * 60 * 1000 } })}
            helperText="Close if still below min progress R after this many hours."
          />
          <SettingsNumberField
            label="Min progress R (time stop)"
            value={Number(data.trading?.minProgressR ?? 0.3)}
            min={0}
            max={1}
            onSave={(n) => saveSettings.mutate({ trading: { minProgressR: n } })}
          />
        </Sheet>
      )}

      {tab === 3 && data && (
        <Sheet variant="outlined" sx={panelSx}>
          <FormControl>
            <FormLabel>Scan timeframes</FormLabel>
            <Select
              multiple
              value={data.scanner?.timeframes ?? ['15m', '1h', '4h']}
              onChange={(_, next) => {
                if (!next?.length) return;
                const prev = data.scanner?.timeframes ?? ['15m', '1h', '4h'];
                if (next.length === prev.length && next.every((t, i) => t === prev[i])) return;
                saveSettings.mutate({ scanner: { timeframes: next } });
              }}
            >
              {TIMEFRAMES.map((t) => (
                <Option key={t} value={t}>
                  {t}
                </Option>
              ))}
            </Select>
            <FormHelperText>Prefer one family (e.g. 1h + 4h). Mixed 15m + 4h often conflicts.</FormHelperText>
          </FormControl>
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
            min={0}
            max={1}
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
          <SwitchRow
            label="Filter strategies by market regime"
            checked={data.regime?.enabled !== false}
            onChange={(checked) => saveSettings.mutate({ regime: { enabled: checked } })}
            hint="When enabled, only strategies designed for the detected regime (trending / ranging / volatile) are evaluated. Unknown regime skips trading. Counter-trend sides are vetoed in strong trends."
          />
          <SwitchRow
            label="HTF trend hard veto"
            checked={data.scanner?.htfVetoEnabled !== false}
            onChange={(checked) => saveSettings.mutate({ scanner: { htfVetoEnabled: checked } })}
            hint="Block BUY when the parent timeframe EMA50/200 is bearish (and vice versa for SELL)."
          />
        </Sheet>
      )}

      {tab === 4 && (
        <Sheet variant="outlined" sx={panelSx}>
          <Typography level="body-sm">
            Configure Telegram / Discord / Email via environment and settings API. Browser
            notifications are enabled by default.
          </Typography>
          <Typography level="title-sm">Web Push (per-trade profit highs)</Typography>
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            Works with the tab closed. Requires HTTPS or localhost, and VAPID keys (
            <code>npm run setup:vapid</code> once). Alerts fire when an open trade&apos;s uPnL sets a
            new high at least $1 above its previous peak.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {!pushEnabled ? (
              <Button disabled={enablePush.isPending} onClick={() => enablePush.mutate()}>
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
            <Alert color="success" variant="soft">
              Web Push is active on this device.
            </Alert>
          )}
        </Sheet>
      )}
    </Box>
  );
}
