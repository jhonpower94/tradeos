import { updateSettingsSchema, binanceSettingsSchema } from '@trading-os/shared';
import { Settings } from '../../models/Settings.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { AppError } from '../../utils/errors.js';
import { exchangeService } from '../exchange/index.js';

/** Legacy factory defaults that made typical wins smaller than losses. */
const LEGACY_ASYMMETRY = {
  minRiskReward: 1.2,
  partialTpFraction: 0.5,
  partialTpAtR: 1,
  trailingActivateAtR: 1,
} as const;

const ASYMMETRY_V2 = {
  minRiskReward: 2,
  partialTpFraction: 0.33,
  partialTpAtR: 1.5,
  trailingActivateAtR: 1.5,
} as const;

/**
 * Upgrade docs still on the old default package so live bots pick up
 * 2R / later partials without a manual Settings save.
 * Skips if the user customized any of these four fields.
 */
async function upgradeLegacyAsymmetryDefaults(
  doc: InstanceType<typeof Settings>,
): Promise<InstanceType<typeof Settings>> {
  const risk = doc.risk as { minRiskReward?: number } | undefined;
  const trading = doc.trading as
    | {
        partialTpFraction?: number;
        partialTpAtR?: number;
        trailingActivateAtR?: number;
      }
    | undefined;

  const stillLegacy =
    (risk?.minRiskReward ?? LEGACY_ASYMMETRY.minRiskReward) === LEGACY_ASYMMETRY.minRiskReward &&
    (trading?.partialTpFraction ?? LEGACY_ASYMMETRY.partialTpFraction) ===
      LEGACY_ASYMMETRY.partialTpFraction &&
    (trading?.partialTpAtR ?? LEGACY_ASYMMETRY.partialTpAtR) === LEGACY_ASYMMETRY.partialTpAtR &&
    (trading?.trailingActivateAtR ?? LEGACY_ASYMMETRY.trailingActivateAtR) ===
      LEGACY_ASYMMETRY.trailingActivateAtR;

  if (!stillLegacy) return doc;

  const updated = await Settings.findOneAndUpdate(
    { _id: doc._id },
    {
      $set: {
        'risk.minRiskReward': ASYMMETRY_V2.minRiskReward,
        'trading.partialTpFraction': ASYMMETRY_V2.partialTpFraction,
        'trading.partialTpAtR': ASYMMETRY_V2.partialTpAtR,
        'trading.trailingActivateAtR': ASYMMETRY_V2.trailingActivateAtR,
      },
    },
    { new: true },
  );
  return updated ?? doc;
}

export async function getSettings(userId: string) {
  let doc = await Settings.findOne({ userId });
  if (!doc) {
    doc = await Settings.create({ userId });
  } else {
    doc = await upgradeLegacyAsymmetryDefaults(doc);
  }
  return sanitizeSettings(doc);
}

function sanitizeSettings(doc: InstanceType<typeof Settings>) {
  const o = doc.toObject();
  return {
    ...o,
    binance: {
      configured: o.binance?.configured ?? false,
      testnet: o.binance?.testnet ?? false,
      apiKey: o.binance?.configured ? '********' : undefined,
    },
    notifications: {
      ...o.notifications,
      telegram: {
        enabled: o.notifications?.telegram?.enabled ?? false,
        chatId: o.notifications?.telegram?.chatId,
        configured: Boolean(o.notifications?.telegram?.botTokenEnc),
      },
      discord: {
        enabled: o.notifications?.discord?.enabled ?? false,
        configured: Boolean(o.notifications?.discord?.webhookUrlEnc),
      },
    },
  };
}

export async function updateSettings(userId: string, body: unknown) {
  const parsed = updateSettingsSchema.parse(body);
  const doc = await Settings.findOneAndUpdate(
    { userId },
    { $set: flattenUpdate(parsed) },
    { new: true, upsert: true },
  );
  return sanitizeSettings(doc!);
}

function flattenUpdate(parsed: Record<string, unknown>) {
  const set: Record<string, unknown> = {};
  for (const [section, value] of Object.entries(parsed)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== undefined) set[`${section}.${k}`] = v;
      }
    } else if (value !== undefined) {
      set[section] = value;
    }
  }
  return set;
}

export async function updateBinanceKeys(userId: string, body: unknown) {
  const parsed = binanceSettingsSchema.parse(body);
  const update: Record<string, unknown> = {
    'binance.testnet': parsed.testnet,
  };
  if (parsed.apiKey && parsed.apiSecret) {
    update['binance.apiKeyEnc'] = encrypt(parsed.apiKey);
    update['binance.apiSecretEnc'] = encrypt(parsed.apiSecret);
    update['binance.configured'] = true;
  }
  const doc = await Settings.findOneAndUpdate({ userId }, { $set: update }, { new: true, upsert: true });
  return sanitizeSettings(doc!);
}

export async function getBinanceCredentials(userId: string) {
  const doc = await Settings.findOne({ userId });
  if (!doc?.binance?.configured || !doc.binance.apiKeyEnc || !doc.binance.apiSecretEnc) {
    return undefined;
  }
  return {
    apiKey: decrypt(doc.binance.apiKeyEnc),
    apiSecret: decrypt(doc.binance.apiSecretEnc),
    testnet: doc.binance.testnet,
  };
}

const BINANCE_TESTNET_REST = 'https://testnet.binance.vision';

export async function testBinanceConnection(userId: string) {
  const creds = await getBinanceCredentials(userId);
  if (!creds) throw new AppError('NO_KEYS', 'Binance keys not configured', 400);

  const previousUrl = exchangeService.getRestUrl();
  try {
    if (creds.testnet) {
      exchangeService.setRestUrl(BINANCE_TESTNET_REST);
    }
    exchangeService.setCredentials({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
    const balances = await exchangeService.getBalances();
    return {
      ok: true,
      assets: balances.length,
      endpoint: exchangeService.getRestUrl(),
      testnet: Boolean(creds.testnet),
    };
  } finally {
    exchangeService.setRestUrl(previousUrl);
  }
}

export async function getRawSettings(userId: string) {
  let doc = await Settings.findOne({ userId });
  if (!doc) doc = await Settings.create({ userId });
  else doc = await upgradeLegacyAsymmetryDefaults(doc);
  return doc;
}
