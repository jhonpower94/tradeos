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
