import { useEffect, useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import IconButton from '@mui/joy/IconButton';
import Input from '@mui/joy/Input';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Switch from '@mui/joy/Switch';
import Typography from '@mui/joy/Typography';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { LoadingState } from '../../components/LoadingState';

type Plan = {
  id: string;
  name: string;
  priceUsdt: number;
  durationDays: number;
  active?: boolean;
};

type Wallet = {
  network: 'trc20' | 'bep20' | 'erc20';
  address: string;
  label?: string;
};

function errMsg(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message ?? e?.message ?? 'Request failed';
}

export function ManagerSubscriptionsPage() {
  const qc = useQueryClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [defaultNetwork, setDefaultNetwork] = useState<'trc20' | 'bep20' | 'erc20'>('trc20');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscription-settings'],
    queryFn: adminApi.getSubscriptionSettings,
  });

  useEffect(() => {
    if (!data) return;
    setPlans((data.plans ?? []).map((p: Plan) => ({ ...p, active: p.active !== false })));
    setWallets(data.wallets ?? []);
    setDefaultNetwork(data.defaultNetwork ?? 'trc20');
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateSubscriptionSettings({
        plans,
        wallets,
        defaultNetwork,
      }),
    onSuccess: () => {
      setMsg('Subscription settings saved');
      void qc.invalidateQueries({ queryKey: ['admin-subscription-settings'] });
    },
    onError: (e) => setErr(errMsg(e)),
  });

  if (isLoading) return <LoadingState />;

  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 720 }}>
      {err && (
        <Alert color="danger">
          {err}
        </Alert>
      )}
      {msg && (
        <Alert color="success">
          {msg}
        </Alert>
      )}

      <Sheet variant="outlined" sx={{ p: 2.5, borderRadius: 'md', display: 'grid', gap: 2 }}>
        <Typography level="title-md">Plans</Typography>
        {plans.map((p, i) => (
          <Box
            key={`${p.id}-${i}`}
            sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}
          >
            <FormControl size="sm">
              <FormLabel>Id</FormLabel>
              <Input
                value={p.id}
                onChange={(e) =>
                  setPlans((prev) => prev.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))
                }
              />
            </FormControl>
            <FormControl size="sm">
              <FormLabel>Name</FormLabel>
              <Input
                value={p.name}
                onChange={(e) =>
                  setPlans((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
            </FormControl>
            <FormControl size="sm">
              <FormLabel>Price USDT</FormLabel>
              <Input
                type="number"
                value={p.priceUsdt}
                onChange={(e) =>
                  setPlans((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, priceUsdt: Number(e.target.value) } : x)),
                  )
                }
              />
            </FormControl>
            <FormControl size="sm">
              <FormLabel>Duration days</FormLabel>
              <Input
                type="number"
                value={p.durationDays}
                onChange={(e) =>
                  setPlans((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, durationDays: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </FormControl>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                checked={p.active !== false}
                onChange={(e) =>
                  setPlans((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)),
                  )
                }
              />
              <Typography level="body-sm">Active</Typography>
              <IconButton
                size="sm"
                color="danger"
                variant="plain"
                onClick={() => setPlans((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Remove plan"
              >
                <DeleteOutline />
              </IconButton>
            </Box>
          </Box>
        ))}
        <Button
          variant="outlined"
          size="sm"
          onClick={() =>
            setPlans((prev) => [
              ...prev,
              {
                id: `plan_${prev.length + 1}`,
                name: 'New plan',
                priceUsdt: 29,
                durationDays: 30,
                active: true,
              },
            ])
          }
        >
          Add plan
        </Button>
      </Sheet>

      <Sheet variant="outlined" sx={{ p: 2.5, borderRadius: 'md', display: 'grid', gap: 2 }}>
        <Typography level="title-md">Treasury wallets</Typography>
        <FormControl size="sm" sx={{ maxWidth: 200 }}>
          <FormLabel>Default network</FormLabel>
          <Select
            value={defaultNetwork}
            onChange={(_, v) => v && setDefaultNetwork(v as typeof defaultNetwork)}
          >
            <Option value="trc20">TRC20</Option>
            <Option value="bep20">BEP20</Option>
            <Option value="erc20">ERC20</Option>
          </Select>
        </FormControl>
        {wallets.map((w, i) => (
          <Box
            key={`${w.network}-${i}`}
            sx={{
              display: 'grid',
              gap: 1,
              gridTemplateColumns: { xs: '1fr', sm: '140px 1fr auto' },
            }}
          >
            <FormControl size="sm">
              <FormLabel>Network</FormLabel>
              <Select
                value={w.network}
                onChange={(_, v) =>
                  v &&
                  setWallets((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, network: v as Wallet['network'] } : x)),
                  )
                }
              >
                <Option value="trc20">TRC20</Option>
                <Option value="bep20">BEP20</Option>
                <Option value="erc20">ERC20</Option>
              </Select>
            </FormControl>
            <FormControl size="sm">
              <FormLabel>Address</FormLabel>
              <Input
                value={w.address}
                onChange={(e) =>
                  setWallets((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)),
                  )
                }
              />
            </FormControl>
            <IconButton
              size="sm"
              color="danger"
              variant="plain"
              sx={{ alignSelf: 'end' }}
              onClick={() => setWallets((prev) => prev.filter((_, j) => j !== i))}
              aria-label="Remove wallet"
            >
              <DeleteOutline />
            </IconButton>
          </Box>
        ))}
        <Button
          variant="outlined"
          size="sm"
          onClick={() =>
            setWallets((prev) => [...prev, { network: defaultNetwork, address: '', label: '' }])
          }
        >
          Add wallet
        </Button>
      </Sheet>

      <Button loading={save.isPending} onClick={() => save.mutate()}>
        Save settings
      </Button>
    </Box>
  );
}
