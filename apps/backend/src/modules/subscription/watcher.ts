import { config } from '../../config/index.js';
import { SubscriptionInvoice } from '../../models/SubscriptionInvoice.js';
import {
  activateSubscriptionFromInvoice,
  classifyPaymentAmount,
  getOrCreateSubscriptionSettings,
} from './index.js';

type IncomingTransfer = {
  txHash: string;
  to: string;
  amount: number;
};

function norm(a: string): string {
  return a.trim().toLowerCase();
}

async function fetchTrc20(address: string): Promise<IncomingTransfer[]> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.trongridApiKey) headers['TRON-PRO-API-KEY'] = config.trongridApiKey;
  const contract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const url =
    `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
    `?only_to=true&limit=50&contract_address=${contract}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data?: Array<{
      transaction_id?: string;
      to?: string;
      value?: string;
      token_info?: { decimals?: number };
    }>;
  };
  return (data.data ?? [])
    .map((t) => {
      const decimals = t.token_info?.decimals ?? 6;
      return {
        txHash: String(t.transaction_id ?? ''),
        to: String(t.to ?? ''),
        amount: Number(t.value ?? 0) / 10 ** decimals,
      };
    })
    .filter((t) => t.txHash && t.amount > 0);
}

async function fetchEvm(
  base: string,
  apiKey: string | undefined,
  address: string,
  contract: string,
): Promise<IncomingTransfer[]> {
  if (!apiKey) return [];
  const url =
    `${base}/api?module=account&action=tokentx&contractaddress=${contract}` +
    `&address=${address}&page=1&offset=50&sort=desc&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    result?: Array<{ hash?: string; to?: string; value?: string; tokenDecimal?: string }>;
  };
  if (!Array.isArray(data.result)) return [];
  return data.result
    .map((t) => {
      const decimals = Number(t.tokenDecimal ?? 6);
      return {
        txHash: String(t.hash ?? ''),
        to: String(t.to ?? ''),
        amount: Number(t.value ?? 0) / 10 ** decimals,
      };
    })
    .filter((t) => t.txHash && t.amount > 0 && norm(t.to) === norm(address));
}

async function fetchIncoming(network: string, address: string): Promise<IncomingTransfer[]> {
  if (network === 'trc20') return fetchTrc20(address);
  if (network === 'erc20') {
    return fetchEvm(
      'https://api.etherscan.io',
      config.etherscanApiKey,
      address,
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
    );
  }
  if (network === 'bep20') {
    return fetchEvm(
      'https://api.bscscan.com',
      config.bscscanApiKey,
      address,
      '0x55d398326f99059ff775485246999027b3197955',
    );
  }
  return [];
}

export async function runSubscriptionWatcherOnce(): Promise<number> {
  const settings = await getOrCreateSubscriptionSettings();
  const tolerance = settings.amountToleranceUsdt ?? 0.01;
  const wallets = settings.wallets ?? [];
  if (!wallets.length) return 0;

  await SubscriptionInvoice.updateMany(
    { status: 'pending', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired' } },
  );

  const pending = await SubscriptionInvoice.find({
    status: { $in: ['pending', 'underpaid'] },
    expiresAt: { $gt: new Date() },
  });
  if (!pending.length) return 0;

  let matched = 0;
  for (const wallet of wallets) {
    let transfers: IncomingTransfer[] = [];
    try {
      transfers = await fetchIncoming(wallet.network, wallet.address);
    } catch (e) {
      console.warn('[subscription-watcher] fetch failed', wallet.network, e);
      continue;
    }

    for (const tx of transfers) {
      const already = await SubscriptionInvoice.findOne({ txHash: tx.txHash }).lean();
      if (already) continue;

      const exact = pending.find(
        (inv) =>
          inv.network === wallet.network &&
          norm(inv.address) === norm(wallet.address) &&
          Math.abs(Number(inv.amountUsdt) - tx.amount) <= tolerance,
      );

      if (exact) {
        const kind = classifyPaymentAmount(Number(exact.amountUsdt), tx.amount, tolerance);
        if (kind === 'exact') {
          await activateSubscriptionFromInvoice(String(exact._id), {
            txHash: tx.txHash,
            observedAmount: tx.amount,
            status: 'paid',
          });
        } else if (kind === 'over') {
          await activateSubscriptionFromInvoice(String(exact._id), {
            txHash: tx.txHash,
            observedAmount: tx.amount,
            status: 'overpaid',
          });
        } else {
          exact.status = 'underpaid';
          exact.txHash = tx.txHash;
          exact.observedAmount = tx.amount;
          await exact.save();
        }
        matched++;
        const idx = pending.findIndex((p) => String(p._id) === String(exact._id));
        if (idx >= 0) pending.splice(idx, 1);
        continue;
      }

      const near = pending.find(
        (inv) =>
          inv.network === wallet.network &&
          norm(inv.address) === norm(wallet.address) &&
          Math.abs(Number(inv.amountUsdt) - tx.amount) <= 1,
      );
      if (!near) continue;
      const kind = classifyPaymentAmount(Number(near.amountUsdt), tx.amount, tolerance);
      if (kind === 'under') {
        near.status = 'underpaid';
        near.txHash = tx.txHash;
        near.observedAmount = tx.amount;
        await near.save();
        matched++;
      } else if (kind === 'over') {
        await activateSubscriptionFromInvoice(String(near._id), {
          txHash: tx.txHash,
          observedAmount: tx.amount,
          status: 'overpaid',
        });
        matched++;
      }
    }
  }
  return matched;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startSubscriptionWatcher() {
  if (timer) return;
  const tick = async () => {
    try {
      await runSubscriptionWatcherOnce();
    } catch (e) {
      console.warn('[subscription-watcher]', e);
    }
  };
  void tick();
  timer = setInterval(() => void tick(), 45_000);
}

export function stopSubscriptionWatcher() {
  if (timer) clearInterval(timer);
  timer = null;
}
