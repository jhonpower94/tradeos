import { STRATEGY_IDS } from '@trading-os/shared';
import type { StrategyId } from '@trading-os/shared';
import type { Strategy } from './types.js';

export type EnabledMap = Record<string, { enabled: boolean }>;

export class StrategyRegistry {
  private readonly strategies = new Map<StrategyId, Strategy>();

  constructor(strategies: Strategy[] = []) {
    for (const strategy of strategies) this.register(strategy);
  }

  register(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  /** All registered strategies, ordered by the canonical `STRATEGY_IDS` list. */
  getAll(): Strategy[] {
    return STRATEGY_IDS.map((id) => this.strategies.get(id)).filter(
      (s): s is Strategy => s != null,
    );
  }

  get(id: StrategyId): Strategy | undefined {
    return this.strategies.get(id);
  }

  /**
   * Strategies allowed to run given a per-user enabled map. Strategies absent
   * from the map, or with no map provided at all, default to enabled.
   */
  getEnabled(enabledMap?: EnabledMap): Strategy[] {
    if (!enabledMap) return this.getAll();
    return this.getAll().filter((s) => enabledMap[s.id]?.enabled !== false);
  }
}
