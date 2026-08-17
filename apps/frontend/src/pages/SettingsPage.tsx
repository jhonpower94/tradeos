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
import ToggleButtonGroup from '@mui/joy/ToggleButtonGroup';
import Typography from '@mui/joy/Typography';import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  TIMEFRAMES,
  applyScannerPreset,
  EARLY_STRATEGY_PACK,
  LAGGING_STRATEGY_PACK,
  isPackFullyEnabled,
  strategyPackPatch,
  type ScannerEntryStyle,
} from '@trading-os/shared';
import { notificationsApi, portfolioApi, settingsApi } from '../api';import { disableWebPush, enableWebPush, getActivePushEndpoint, isIosDevice, isPushApiAvailable, isStandaloneDisplay } from '../lib/webPush';
import { PageHeader } from '../components/PageHeader';
import { KeyValueList } from '../components/ResponsiveRecordList';
import { formatDateTime } from '../utils/format';
import { monoSx } from '../theme/theme';

function errMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

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
  p: 2.5,
  display: 'grid',
  gap: 2.25,
  maxWidth: 520,
  borderRadius: 'md',
} as const;

export function SettingsPage() {
  const [tab, setTab] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const isPaper = (data?.trading?.mode ?? 'paper') === 'paper';
  const { data: ledger } = useQuery({
    queryKey: ['paper-ledger'],
    queryFn: portfolioApi.ledger,
    enabled: isPaper && tab === 3,
  });

  useEffect(() => {
    void getActivePushEndpoint().then((ep) => setPushEnabled(Boolean(ep)));
  }, [tab]);

  const msgSeverity = /ok|saved|sent|connection ok|enabled|disabled|active|deposit|withdrawal/i.test(msg)
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
  const deposit = useMutation({
    mutationFn: () => portfolioApi.deposit(Number(amount), note || undefined),
    onSuccess: () => {
      setAmount('');
      setNote('');
      setMsg('Deposit saved');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['paper-ledger'] });
    },
    onError: (e: unknown) => setMsg(errMsg(e)),
  });
  const withdraw = useMutation({
    mutationFn: () => portfolioApi.withdraw(Number(amount), note || undefined),
    onSuccess: () => {
      setAmount('');
      setNote('');
      setMsg('Withdrawal saved');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['paper-ledger'] });
    },
    onError: (e: unknown) => setMsg(errMsg(e)),
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
      <PageHeader title="Settings" subtitle="Exchange, risk, paper funding, scanner, and alerts" />
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
        sx={{ mb: 2, bgcolor: 'transparent' }}
      >
        <TabList
          disableUnderline
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(6, 1fr)',
            },
            gap: 0.75,
            p: 0.75,
            overflow: 'visible',
            bgcolor: 'background.level1',
            borderRadius: 'lg',
            '--TabList-underlineThickness': '0px',
          }}
        >
          {['Binance', 'Risk', 'Trading', 'Paper', 'Scanner', 'Notifications'].map((label, i) => (
            <Tab
              key={label}
              value={i}
              variant={tab === i ? 'solid' : 'plain'}
              color={tab === i ? 'primary' : 'neutral'}
              sx={{
                width: '100%',
                minHeight: 40,
                borderRadius: 'md',
                justifyContent: 'center',
                px: 1,
                fontWeight: tab === i ? 600 : 500,
              }}
            >
              {label}
            </Tab>
          ))}
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

      {tab === 3 && (
        <Box sx={{ display: 'grid', gap: 3, maxWidth: 560 }}>
          {!isPaper ? (
            <Sheet variant="outlined" sx={panelSx}>
              <Typography level="title-md">Paper funding</Typography>
              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                Deposits, withdrawals, and the funding ledger apply in paper mode only. Switch
                trading mode to Paper on the Trading tab to fund a simulated account.
              </Typography>
            </Sheet>
          ) : (
            <>
              <Sheet variant="outlined" sx={panelSx}>
                <Typography level="title-md">Fund paper account</Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                  Deposits and withdrawals adjust equity on top of starting balance and realized
                  trade PnL. Starting balance is set on the Trading tab.
                </Typography>
                <FormControl>
                  <FormLabel>Amount (USDT)</FormLabel>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel>Note (optional)</FormLabel>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} />
                </FormControl>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button disabled={!Number(amount) || deposit.isPending} onClick={() => deposit.mutate()}>
                    Deposit
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    disabled={!Number(amount) || withdraw.isPending}
                    onClick={() => withdraw.mutate()}
                  >
                    Withdraw
                  </Button>
                </Box>
              </Sheet>
              <Box>
                <Typography level="title-md" sx={{ mb: 1.5 }}>
                  Funding ledger
                </Typography>
                <KeyValueList
                  emptyTitle="No deposits or withdrawals yet."
                  items={(ledger?.items ?? []).map((e: Record<string, unknown>) => ({
                    key: String(e._id),
                    primary: String(e.type),
                    secondary: String(e.note ?? formatDateTime(e.createdAt as string)),
                    trailing: (
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={monoSx}>{Number(e.amount).toFixed(2)}</Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {e.createdAt ? formatDateTime(String(e.createdAt)) : '—'}
                        </Typography>
                      </Box>
                    ),
                  }))}
                />
              </Box>
            </>
          )}
        </Box>
      )}

      {tab === 4 && data && (
        <Sheet variant="outlined" sx={panelSx}>
          <FormControl>
            <FormLabel>Entry profile</FormLabel>
            <ToggleButtonGroup
              size="sm"
              value={(data.scanner?.entryStyle as ScannerEntryStyle | undefined) ?? 'confirmed'}
              onChange={(_, v) => {
                if (!v || v === (data.scanner?.entryStyle ?? 'confirmed')) return;
                saveSettings.mutate(applyScannerPreset(v as ScannerEntryStyle));
              }}
            >
              <Button value="confirmed">Confirmed</Button>
              <Button value="early">Early entry</Button>
            </ToggleButtonGroup>
            <FormHelperText>
              Confirmed waits for multi-strategy agreement after the trend is clear. Early joins on
              pullback / ignition while HTF stays aligned. Early is noisier — use paper first.
            </FormHelperText>
          </FormControl>
          <Box>
            <Typography level="title-sm" sx={{ mb: 1 }}>
              Strategy packs
            </Typography>
            <SwitchRow
              label="Early pack (pullback / ignition)"
              checked={isPackFullyEnabled(
                data.strategies as Record<string, { enabled?: boolean }> | undefined,
                EARLY_STRATEGY_PACK,
              )}
              onChange={(checked) =>
                saveSettings.mutate({
                  strategies: strategyPackPatch([...EARLY_STRATEGY_PACK], checked),
                })
              }
              hint="ema_pullback, rsi_pullback, order_block, FVG, CHoCH, ADX ignition, BB squeeze, NR7, support/resistance, liquidity sweep."
            />
            <Box sx={{ mt: 1.5 }}>
              <SwitchRow
                label="Lagging pack (trend confirmation)"
                checked={isPackFullyEnabled(
                  data.strategies as Record<string, { enabled?: boolean }> | undefined,
                  LAGGING_STRATEGY_PACK,
                )}
                onChange={(checked) =>
                  saveSettings.mutate({
                    strategies: strategyPackPatch([...LAGGING_STRATEGY_PACK], checked),
                  })
                }
                hint="supertrend, ichimoku, trend_continuation, atr_trend, ema_cross, macd_momentum. Prefer off for Early entry."
              />
            </Box>
          </Box>
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
          <SwitchRow
            label="Location gate"
            checked={data.scanner?.locationGateEnabled !== false}
            onChange={(checked) => saveSettings.mutate({ scanner: { locationGateEnabled: checked } })}
            hint="Only fully analyze a pair when price is near support, resistance, VWAP, pivots, order blocks, or previous-day high/low. Far from a level is skipped. At a level without confirmation becomes Watching."
          />
          <SettingsNumberField
            label="Location proximity (ATR)"
            value={Number(data.scanner?.locationProximityAtr ?? 1.5)}
            min={0.25}
            max={5}
            onSave={(n) => saveSettings.mutate({ scanner: { locationProximityAtr: n } })}
          />
          <SwitchRow
            label="BTC relative strength"
            checked={data.scanner?.btcRelativeStrengthEnabled !== false}
            onChange={(checked) => saveSettings.mutate({ scanner: { btcRelativeStrengthEnabled: checked } })}
            hint="Longs must outperform BTC over 24h; shorts must underperform. Missing BTC data does not block."
          />
        </Sheet>
      )}

      {tab === 5 && (
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
          {isIosDevice() && !isStandaloneDisplay() && (
            <Alert color="warning" variant="soft">
              <Typography level="title-sm" sx={{ mb: 0.5 }}>
                Install on your Home Screen (required on iPhone)
              </Typography>
              <Typography level="body-sm" component="ol" sx={{ m: 0, pl: 2.5 }}>
                <li>Tap Share in Safari or Chrome</li>
                <li>Choose Add to Home Screen</li>
                <li>Open Trading OS from the new Home Screen icon</li>
                <li>Return here and tap Enable Web Push</li>
              </Typography>
              <Typography level="body-xs" sx={{ mt: 1, color: 'text.secondary' }}>
                iOS only exposes push notifications inside the installed Home Screen app, not in a
                normal browser tab.
              </Typography>
            </Alert>
          )}
          {!isIosDevice() && !isPushApiAvailable() && (
            <Alert color="neutral" variant="soft">
              Web Push is not available in this browser. Use a current Chrome, Edge, Firefox, or
              Safari on a device that supports the Push API.
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {!pushEnabled ? (
              <Button
                disabled={enablePush.isPending || !isPushApiAvailable()}
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
            <Alert color="success" variant="soft">
              Web Push is active on this device.
            </Alert>
          )}
        </Sheet>
      )}
    </Box>
  );
}
