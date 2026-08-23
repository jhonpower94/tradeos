import { useState } from 'react';
import Alert from '@mui/joy/Alert';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { LoadingState } from '../../components/LoadingState';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime } from '../../utils/format';

type AdminUser = {
  _id?: string;
  id?: string;
  email: string;
  role?: string;
  status?: string;
  totpEnabled?: boolean;
  subscription?: { active?: boolean; endsAt?: string | null; planId?: string | null } | null;
};

function uid(u: AdminUser) {
  return String(u.id ?? u._id);
}

function errMsg(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message ?? e?.message ?? 'Request failed';
}

export function ManagerUsersPage() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [grantDays, setGrantDays] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
  });

  const users: AdminUser[] = Array.isArray(data) ? data : (data?.items ?? data?.users ?? []);

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => adminApi.patchUser(id, body),
    onSuccess: () => {
      setMsg('User updated');
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const grant = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) =>
      adminApi.grantSubscription(id, { days }),
    onSuccess: () => {
      setMsg('Subscription granted');
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.revokeSubscription(id),
    onSuccess: () => {
      setMsg('Subscription revoked');
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e) => setErr(errMsg(e)),
  });

  if (isLoading) return <LoadingState />;

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
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
      {users.map((u) => {
        const id = uid(u);
        return (
          <Sheet key={id} variant="outlined" sx={{ p: 2, borderRadius: 'md', display: 'grid', gap: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography level="title-sm">{u.email}</Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  {u.role ?? 'user'}
                  {u.totpEnabled ? ' · MFA on' : ''}
                  {u.subscription?.active
                    ? ` · sub until ${u.subscription.endsAt ? formatDateTime(u.subscription.endsAt) : '—'}`
                    : ' · no active sub'}
                </Typography>
              </Box>
              <StatusChip status={u.status ?? 'active'} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <FormControl size="sm" sx={{ minWidth: 120 }}>
                <FormLabel>Role</FormLabel>
                <Select
                  value={u.role ?? 'user'}
                  onChange={(_, v) => v && patch.mutate({ id, body: { role: v } })}
                >
                  <Option value="user">user</Option>
                  <Option value="admin">admin</Option>
                </Select>
              </FormControl>
              <FormControl size="sm" sx={{ minWidth: 120 }}>
                <FormLabel>Status</FormLabel>
                <Select
                  value={u.status ?? 'active'}
                  onChange={(_, v) => v && patch.mutate({ id, body: { status: v } })}
                >
                  <Option value="active">active</Option>
                  <Option value="disabled">disabled</Option>
                </Select>
              </FormControl>
              <FormControl size="sm" sx={{ width: 100 }}>
                <FormLabel>Grant days</FormLabel>
                <Input
                  type="number"
                  value={grantDays[id] ?? '30'}
                  onChange={(e) => setGrantDays((s) => ({ ...s, [id]: e.target.value }))}
                />
              </FormControl>
              <Button
                size="sm"
                onClick={() => grant.mutate({ id, days: Number(grantDays[id] ?? 30) || 30 })}
              >
                Grant sub
              </Button>
              <Button size="sm" variant="outlined" color="warning" onClick={() => revoke.mutate(id)}>
                Revoke
              </Button>
            </Box>
          </Sheet>
        );
      })}
      {!users.length && (
        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
          No users found.
        </Typography>
      )}
    </Box>
  );
}
