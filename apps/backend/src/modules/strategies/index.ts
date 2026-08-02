import type { StrategyResult } from '@trading-os/shared';
import { builtinStrategies } from './builtin/index.js';
import { StrategyRegistry, type EnabledMap } from './registry.js';
import type { StrategyContext } from './types.js';
import { noTrade, evidence } from './utils.js';

export * from './types.js';
export * from './utils.js';
export * from './registry.js';
export * from './builtin/index.js';

/** Shared registry pre-populated with all built-in strategies. */
export const strategyRegistry = new StrategyRegistry(builtinStrategies);

/**
 * Evaluate every enabled strategy against the given context, returning one
 * `StrategyResult` per strategy. Individual strategy failures are isolated
 * and surfaced as a `NO_TRADE` result rather than aborting the whole batch.
 */
export function runAllStrategies(
  ctx: StrategyContext,
  enabledMap?: EnabledMap,
): StrategyResult[] {
  const strategies = strategyRegistry.getEnabled(enabledMap);
  const results: StrategyResult[] = [];
  for (const strategy of strategies) {
    try {
      results.push(strategy.evaluate(ctx));
    } catch (err) {
      results.push(
        noTrade(strategy.id, [
          evidence(strategy.id, 'Strategy evaluation error', 1, err instanceof Error ? err.message : String(err)),
        ]),
      );
    }
  }
  return results;
}
