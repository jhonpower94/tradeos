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
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  TIMEFRAMES,
  applyScannerPreset,
  countEnabledStrategies,
  EARLY_STRATEGY_PACK,
  formatStrategyLabel,
  LAGGING_STRATEGY_PACK,
  OTHER_STRATEGY_PACK,
  strategyPackPatch,
  strategySinglePatch,
  type ScannerEntryStyle,
  type StrategyId,
} from '@trading-os/shared';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import Link from '@mui/joy/Link';
import { authApi, notificationsApi, portfolioApi, settingsApi } from '../api';
import { disableWebPush, enableWebPush, getActivePushEndpoint, isIosDevice, isPushApiAvailable } from '../lib/webPush';
import { PageHeader } from '../components/PageHeader';
import { PasswordField } from '../components/PasswordField';
import { KeyValueList } from '../components/ResponsiveRecordList';
import { InstallAppButton } from '../components/InstallAppButton';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { formatDateTime } from '../utils/format';
import { monoSx } from '../theme/theme';
import { useAuthStore } from '../stores/authStore';

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

function countPackEnabled(
  strategies: Record<string, { enabled?: boolean } | undefined> | undefined,
  pack: readonly StrategyId[],
): number {
  return pack.filter((id) => strategies?.[id]?.enabled !== false).length;
}

/** Collapsible group: pick strategies to watch (no confusing master switch). */
function StrategyWatchGroup({
  title,
  description,
  pack,
  strategies,
  defaultOpen,
  onToggleOne,
  onSetPack,
}: {
  title: string;
  description: string;
  pack: readonly StrategyId[];
  strategies: Record<string, { enabled?: boolean } | undefined> | undefined;
  defaultOpen: boolean;
  onToggleOne: (id: StrategyId, enabled: boolean) => void;
  onSetPack: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const onCount = countPackEnabled(strategies, pack);
  const allOn = onCount === pack.length;
  const allOff = onCount === 0;

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'sm',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          px: 1.5,
          py: 1.25,
          bgcolor: 'background.level1',
        }}
      >
        <Button
          size="sm"
          variant="plain"
          color="neutral"
          onClick={() => setOpen((v) => !v)}
          sx={{ flex: 1, justifyContent: 'flex-start', minWidth: 0, px: 0.5 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
            <Typography level="title-sm">
              {open ? '▾' : '▸'} {title}
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              {onCount}/{pack.length} on
            </Typography>
          </Box>
        </Button>
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          disabled={allOn}
          onClick={() => onSetPack(true)}
        >
          All on
        </Button>
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          disabled={allOff}
          onClick={() => onSetPack(false)}
        >
          All off
        </Button>
      </Box>
      {open && (
        <Box sx={{ px: 1.5, py: 1.25, display: 'grid', gap: 1 }}>
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            {description}
          </Typography>
          {pack.map((id) => (
            <SwitchRow
              key={id}
              label={formatStrategyLabel(id)}
              checked={strategies?.[id]?.enabled !== false}
              onChange={(checked) => onToggleOne(id, checked)}
            />
          ))}
        </Box>
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
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const raw = searchParams.get('tab');
    if (raw === 'binance' || raw === '0') return 0;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 0;
  });
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaOtpauth, setMfaOtpauth] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const canUseLive = user?.role === 'admin' || Boolean(user?.subscription?.active);
  const qc = useQueryClient();
  const pwaInstall = usePwaInstall();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const isPaper = (data?.trading?.mode ?? 'paper') === 'paper';
  const { data: ledger } = useQuery({
    queryKey: ['paper-ledger'],
    queryFn: portfolioApi.ledger,
    enabled: isPaper && tab === 3,
  });

  useEffect(() => {
    const raw = searchParams.get('tab');
    if (raw === 'binance' || raw === '0') {
      setTab(0);
      return;
    }
    if (raw == null) return;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 6) setTab(n);
  }, [searchParams]);

  useEffect(() => {
    void authApi.me().then((me) => {
      if (token) setAuth(token, me, refreshToken);
    }).catch(() => undefined);
  }, [token, refreshToken, setAuth]);

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
  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setOldPassword('');
      setNewPassword('');
      setMsg('Password changed');
    },
    onError: (e: unknown) => setMsg(errMsg(e)),
  });
  const mfaSetup = useMutation({
    mutationFn: authApi.mfaSetup,
    onSuccess: (r) => {
      setMfaSecret(r.secret ?? '');
      setMfaOtpauth(r.otpauthUrl ?? '');
      setMsg('Scan the secret in your authenticator app, then confirm with a code');
    },
    onError: (e: unknown) => setMsg(errMsg(e)),
  });
  const mfaEnable = useMutation({
    mutationFn: () => authApi.mfaEnable(mfaCode.trim()),
    onSuccess: async (r) => {
      setBackupCodes(r.backupCodes ?? []);
      setMfaCode('');
      setMsg('MFA enabled — store backup codes somewhere safe');
      const me = await authApi.me();
      if (token) setAuth(token, me, refreshToken);
    },
    onError: (e: unknown) => setMsg(errMsg(e)),
  });
  const mfaDisable = useMutation({
    mutationFn: () => authApi.mfaDisable(mfaDisablePassword, mfaDisableCode.trim()),
    onSuccess: async () => {
      setMfaDisablePassword('');
      setMfaDisableCode('');
      setMfaSecret('');
      setMfaOtpauth('');
      setBackupCodes([]);
      setMsg('MFA disabled');
      const me = await authApi.me();
      if (token) setAuth(token, me, refreshToken);
    },
    onError: (e: unknown) => setMsg(errMsg(e)),
  });

  return (
    <Box>
      <PageHeader title="Settings" subtitle="Exchange, risk, paper funding, scanner, alerts, and account" />
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
              md: 'repeat(4, 1fr)',
              lg: 'repeat(7, 1fr)',
            },
            gap: 0.75,
            p: 0.75,
            overflow: 'visible',
            bgcolor: 'background.level1',
            borderRadius: 'lg',
            '--TabList-underlineThickness': '0px',
            '--Tab-indicatorThickness': '0px',
            boxShadow: 'none',
            '&::before': { display: 'none' },
            '&::after': { display: 'none' },
          }}
        >
          {['Binance', 'Risk', 'Trading', 'Paper', 'Scanner', 'Notifications', 'Account'].map((label, i) => (
            <Tab
              key={label}
              value={i}
              disableIndicator
              variant={tab === i ? 'solid' : 'plain'}
              color={tab === i ? 'primary' : 'neutral'}
              sx={{
                width: '100%',
                minHeight: 40,
                borderRadius: 'md',
                justifyContent: 'center',
                px: 1,
                fontWeight: tab === i ? 600 : 500,
                '--Tab-indicatorThickness': '0px',
                '&::after': { display: 'none' },
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
            blocked on your network — use a VPN on the server or set BINANCE_REST_URL in .env (e.g.
            https://api1.binance.com). If you see request weight / IP banned, wait for the ban to lift,
            lower scanner hot set / concurrency, or raise scan interval — the app rate-limits Binance
            weight but shared VPN IPs can still get banned.
            For live margin/shorts, enable Spot &amp; Margin Trading and Universal Transfer on the API key.
          </Typography>
          <FormControl>
            <FormLabel>API Key</FormLabel>
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel>API Secret</FormLabel>
            <PasswordField value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="off" />
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
            helperText="Fraction of equity (0.01 = 1%). Position size ≈ (equity × risk) / stop distance. Raise this or lower min notional if signals show Size below the floor."
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
            helperText="Free USDT is split equally across remaining slots. Fewer slots → larger size per trade."
          />
          <SettingsNumberField
            label="Min risk/reward"
            value={Number(data.risk?.minRiskReward ?? 2)}
            min={0.5}
            max={10}
            onSave={(n) => saveSettings.mutate({ risk: { minRiskReward: n } })}
          />
          <SettingsNumberField
            label="Min notional per trade (USDT)"
            value={Number(data.risk?.minNotionalPerTrade ?? 1000)}
            min={0}
            max={1_000_000}
            onSave={(n) => saveSettings.mutate({ risk: { minNotionalPerTrade: n } })}
            helperText="Approve is blocked when estimated size is below this floor. Size is capped by max risk per trade and free USDT / slots. If signals are blocked, raise max risk % or lower this floor. 0 disables."
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
                if (value === 'live' && !canUseLive) {
                  setMsg('Active USDT subscription required for live trading');
                  return;
                }
                saveSettings.mutate({ trading: { mode: value } });
              }}
            >
              <Option value="paper">Paper</Option>
              <Option value="live" disabled={!canUseLive}>
                Live{!canUseLive ? ' (subscription required)' : ''}
              </Option>
            </Select>
            {!canUseLive && (
              <Alert color="warning" variant="soft" sx={{ mt: 1.5 }}>
                Live trading needs an active subscription.{' '}
                <Link component={RouterLink} to="/subscription">
                  View plans
                </Link>
              </Alert>
            )}
          </FormControl>
          <FormControl>
            <FormLabel>Live execution venue</FormLabel>
            <Select
              value={data.trading?.executionVenue ?? 'margin'}
              onChange={(_, value) => {
                if (!value || value === data.trading?.executionVenue) return;
                saveSettings.mutate({ trading: { executionVenue: value } });
              }}
            >
              <Option value="margin">Isolated margin (shorts)</Option>
              <Option value="spot">Spot only (rollback)</Option>
            </Select>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
              Margin requires API key permissions: Enable Spot &amp; Margin Trading and Universal
              Transfer. Interest accrues on borrowed assets while shorts are open.
            </Typography>
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
                  Paper equity starts at 0. Deposit USDT here to fund simulated trading. Withdrawals
                  and the ledger apply in paper mode only.
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
            <Typography level="title-sm" sx={{ mb: 0.75 }}>
              Strategies to watch
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1.5 }}>
              The scanner only evaluates strategies that are On. Turn on any combination — one, a
              few, or all. Match Min aligned strategies to how many you keep On.
            </Typography>
            {(() => {
              const stratMap = data.strategies as
                | Record<string, { enabled?: boolean } | undefined>
                | undefined;
              const enabledCount = countEnabledStrategies(stratMap);
              const minAligned = Number(data.scanner?.minAlignedStrategies ?? 2);
              const entryEarly =
                (data.scanner?.entryStyle as ScannerEntryStyle | undefined) === 'early';
              const watching = [
                ...EARLY_STRATEGY_PACK,
                ...LAGGING_STRATEGY_PACK,
                ...OTHER_STRATEGY_PACK,
              ].filter((id) => stratMap?.[id]?.enabled !== false);
              const toggleOne = (id: StrategyId, checked: boolean) =>
                saveSettings.mutate({ strategies: strategySinglePatch(id, checked) });
              const setPack = (pack: readonly StrategyId[], enabled: boolean) =>
                saveSettings.mutate({ strategies: strategyPackPatch([...pack], enabled) });

              return (
                <Box sx={{ display: 'grid', gap: 1.25 }}>
                  <Typography level="body-sm">
                    Watching{' '}
                    <Typography component="span" sx={{ fontWeight: 'lg' }}>
                      {enabledCount}
                    </Typography>{' '}
                    strateg{enabledCount === 1 ? 'y' : 'ies'}
                    {watching.length > 0 && watching.length <= 6 ? (
                      <Typography
                        component="span"
                        level="body-xs"
                        sx={{ color: 'text.tertiary', display: 'block', mt: 0.5 }}
                      >
                        {watching.map(formatStrategyLabel).join(' · ')}
                      </Typography>
                    ) : null}
                  </Typography>
                  {enabledCount > 0 && enabledCount < minAligned ? (
                    <Alert color="warning" variant="soft">
                      Only {enabledCount} On, but Min aligned is {minAligned}. Lower Min aligned or
                      enable more strategies.
                    </Alert>
                  ) : null}
                  <StrategyWatchGroup
                    title="Early setups"
                    description="Pullbacks, structure, order blocks, sweeps — best for Early entry."
                    pack={EARLY_STRATEGY_PACK}
                    strategies={stratMap}
                    defaultOpen
                    onToggleOne={toggleOne}
                    onSetPack={(enabled) => setPack(EARLY_STRATEGY_PACK, enabled)}
                  />
                  <StrategyWatchGroup
                    title="Trend confirmation"
                    description="Lagging trend tools. Usually off for Early entry; useful for Confirmed."
                    pack={LAGGING_STRATEGY_PACK}
                    strategies={stratMap}
                    defaultOpen={!entryEarly}
                    onToggleOne={toggleOne}
                    onSetPack={(enabled) => setPack(LAGGING_STRATEGY_PACK, enabled)}
                  />
                  <StrategyWatchGroup
                    title="Other"
                    description="Everything else. Turn these off when you want a tight Early-only watchlist."
                    pack={OTHER_STRATEGY_PACK}
                    strategies={stratMap}
                    defaultOpen={false}
                    onToggleOne={toggleOne}
                    onSetPack={(enabled) => setPack(OTHER_STRATEGY_PACK, enabled)}
                  />
                </Box>
              );
            })()}
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
            value={Number(data.scanner?.hotSetSize ?? 40)}
            onSave={(n) => saveSettings.mutate({ scanner: { hotSetSize: n } })}
            helperText="Top liquid symbols scanned each cycle. Lower = less Binance weight."
          />
          <SettingsNumberField
            label="Concurrency"
            value={Number(data.scanner?.concurrency ?? 3)}
            onSave={(n) => saveSettings.mutate({ scanner: { concurrency: n } })}
            helperText="Parallel symbol workers. Keep low (2–3) to avoid IP weight bans."
          />
          <SettingsNumberField
            label="Scan interval (seconds)"
            value={Number(data.scanner?.scanIntervalSec ?? 120)}
            min={60}
            max={900}
            onSave={(n) => saveSettings.mutate({ scanner: { scanIntervalSec: n } })}
            helperText="Pause after each full scan before the next (min 60s). Higher = safer for Binance limits."
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
          <SwitchRow
            label="Hide symbol after manual loss until opposite momentum"
            checked={data.scanner?.hideAfterManualLoss !== false}
            onChange={(checked) => saveSettings.mutate({ scanner: { hideAfterManualLoss: checked } })}
            hint="After you manually close a losing trade, that symbol stays hidden from signals until a triggered opportunity appears on the opposite side."
          />
        </Sheet>
      )}

      {tab === 5 && (
        <Sheet variant="outlined" sx={panelSx}>
          <Typography level="title-sm">Web Push (per-trade profit highs)</Typography>
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            Works with the tab closed. Requires HTTPS or localhost, and VAPID keys (
            <code>npm run setup:vapid</code> once). Alerts fire when an open trade&apos;s uPnL sets a
            new high at least $1 above its previous peak.
          </Typography>

          {pwaInstall.showInstallCta && (
            <Sheet
              variant="soft"
              color={pwaInstall.needsIosGuide ? 'warning' : 'primary'}
              sx={{
                p: { xs: 1.75, sm: 2 },
                borderRadius: 'lg',
                display: 'grid',
                gap: 1.5,
              }}
            >
              <Box>
                <Typography level="title-sm" sx={{ mb: 0.25 }}>
                  {pwaInstall.needsIosGuide ? 'Install on Home Screen' : 'Install Trading OS'}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                  {pwaInstall.needsIosGuide
                    ? 'iPhone and iPad only allow Web Push from the Home Screen app. Tap below for a short install guide, then enable notifications.'
                    : 'Install the app for a full-screen experience and reliable notifications with the tab closed.'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <InstallAppButton size="md" variant="solid" color="primary" />
              </Box>
            </Sheet>
          )}

          {pwaInstall.isInstalled && (
            <Alert color="success" variant="soft">
              Running as an installed app on this device.
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

      {tab === 6 && (
        <Box sx={{ display: 'grid', gap: 3, maxWidth: 560 }}>
          <Sheet variant="outlined" sx={panelSx}>
            <Typography level="title-md">Change password</Typography>
            <FormControl required>
              <FormLabel>Current password</FormLabel>
              <PasswordField
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
              />
            </FormControl>
            <FormControl required>
              <FormLabel>New password</FormLabel>
              <PasswordField
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <FormHelperText>Min 8 characters</FormHelperText>
            </FormControl>
            <Button
              disabled={!oldPassword || newPassword.length < 8 || changePassword.isPending}
              loading={changePassword.isPending}
              onClick={() => changePassword.mutate()}
            >
              Update password
            </Button>
          </Sheet>

          <Sheet variant="outlined" sx={panelSx}>
            <Typography level="title-md">Authenticator (TOTP)</Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Status: {user?.totpEnabled ? 'Enabled' : 'Disabled'}
            </Typography>
            {!user?.totpEnabled ? (
              <>
                <Button
                  variant="outlined"
                  loading={mfaSetup.isPending}
                  onClick={() => mfaSetup.mutate()}
                >
                  Start MFA setup
                </Button>
                {mfaSecret && (
                  <>
                    <Alert color="neutral" variant="soft">
                      <Typography level="body-sm" sx={{ mb: 1 }}>
                        Add this secret in Google Authenticator (or similar), then enter a code.
                      </Typography>
                      <Typography level="body-sm" sx={{ ...monoSx, wordBreak: 'break-all' }}>
                        {mfaSecret}
                      </Typography>
                      {mfaOtpauth && (
                        <Typography level="body-xs" sx={{ mt: 1, wordBreak: 'break-all' }}>
                          {mfaOtpauth}
                        </Typography>
                      )}
                    </Alert>
                    <FormControl required>
                      <FormLabel>Confirmation code</FormLabel>
                      <Input
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        placeholder="123456"
                        slotProps={{ input: { inputMode: 'numeric', autoComplete: 'one-time-code' } }}
                      />
                    </FormControl>
                    <Button
                      disabled={mfaCode.trim().length < 6 || mfaEnable.isPending}
                      loading={mfaEnable.isPending}
                      onClick={() => mfaEnable.mutate()}
                    >
                      Enable MFA
                    </Button>
                  </>
                )}
                {backupCodes.length > 0 && (
                  <Alert color="warning" variant="soft">
                    <Typography level="title-sm" sx={{ mb: 1 }}>
                      Backup codes (shown once)
                    </Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2.5, ...monoSx }}>
                      {backupCodes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </Box>
                  </Alert>
                )}
              </>
            ) : (
              <>
                <FormControl required>
                  <FormLabel>Password</FormLabel>
                  <PasswordField
                    value={mfaDisablePassword}
                    onChange={(e) => setMfaDisablePassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </FormControl>
                <FormControl required>
                  <FormLabel>Authenticator or backup code</FormLabel>
                  <Input
                    value={mfaDisableCode}
                    onChange={(e) => setMfaDisableCode(e.target.value)}
                  />
                </FormControl>
                <Button
                  color="danger"
                  variant="outlined"
                  disabled={!mfaDisablePassword || !mfaDisableCode || mfaDisable.isPending}
                  loading={mfaDisable.isPending}
                  onClick={() => mfaDisable.mutate()}
                >
                  Disable MFA
                </Button>
              </>
            )}
          </Sheet>

          <Sheet variant="outlined" sx={panelSx}>
            <Typography level="title-md">Subscription</Typography>
            <Typography level="body-sm">
              {user?.role === 'admin'
                ? 'Admin — live trading unlocked'
                : user?.subscription?.active
                  ? `Active${user.subscription.endsAt ? ` until ${formatDateTime(user.subscription.endsAt)}` : ''}`
                  : 'No active subscription'}
            </Typography>
            <Button component={RouterLink} to="/subscription" variant="outlined">
              Manage subscription
            </Button>
          </Sheet>
        </Box>
      )}
    </Box>
  );
}
