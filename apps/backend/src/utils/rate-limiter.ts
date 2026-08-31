/** Simple in-memory token bucket rate limiter */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(cost = 1): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= cost) {
        this.tokens -= cost;
        return;
      }
      const waitMs = Math.ceil(((cost - this.tokens) / this.refillPerSecond) * 1000);
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 50)));
    }
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
  }
}

/**
 * Rolling-window weight budget (Binance IP REQUEST_WEIGHT is per minute).
 * Callers pass endpoint weights; acquire() blocks until the window has room.
 */
export class WeightWindowLimiter {
  private events: Array<{ at: number; w: number }> = [];

  constructor(
    private maxWeightPerWindow: number,
    private windowMs = 60_000,
  ) {}

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    while (this.events.length && this.events[0]!.at < cutoff) {
      this.events.shift();
    }
  }

  used(now = Date.now()): number {
    this.prune(now);
    let sum = 0;
    for (const e of this.events) sum += e.w;
    return sum;
  }

  async acquire(weight: number): Promise<void> {
    const w = Math.max(1, Math.floor(weight));
    for (;;) {
      const now = Date.now();
      this.prune(now);
      const current = this.used(now);
      if (current + w <= this.maxWeightPerWindow) {
        this.events.push({ at: now, w });
        return;
      }
      const oldest = this.events[0];
      const waitMs = oldest
        ? Math.max(50, oldest.at + this.windowMs - now + 25)
        : 250;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 5_000)));
    }
  }

  /** Align local usage with Binance `X-MBX-USED-WEIGHT-1M` when higher than ours. */
  syncUsedWeight(remoteUsed: number, now = Date.now()): void {
    if (!(remoteUsed > 0)) return;
    const local = this.used(now);
    if (remoteUsed > local) {
      this.events.push({ at: now, w: remoteUsed - local });
    }
  }
}

/** Spot klines weight by limit (Binance REQUEST_WEIGHT). */
export function binanceKlinesWeight(limit: number): number {
  const n = Number(limit);
  if (!(n > 0) || n < 100) return 1;
  if (n < 500) return 2;
  if (n <= 1000) return 5;
  return 10;
}

/** Spot depth weight by limit. */
export function binanceDepthWeight(limit: number): number {
  const n = Number(limit) || 100;
  if (n <= 100) return 5;
  if (n <= 500) return 25;
  if (n <= 1000) return 50;
  return 250;
}

export function parseBinanceBanUntilMs(body: string): number | null {
  const m = /banned until\s+(\d+)/i.exec(body);
  if (!m?.[1]) return null;
  const raw = Number(m[1]);
  if (!Number.isFinite(raw)) return null;
  // Binance usually sends epoch ms; treat small values as seconds.
  return raw < 1e12 ? raw * 1000 : raw;
}
