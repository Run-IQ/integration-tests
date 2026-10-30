import { computeRuleChecksum } from '@run-iq/core';
import type { CalculationModel, ISnapshotAdapter, PPEPlugin, Rule, Snapshot } from '@run-iq/core';

export interface PercentageParams {
  base: string;
  rate: number;
}

function isPercentageParams(p: unknown): p is PercentageParams {
  const params = p as Partial<PercentageParams> | null | undefined;
  return typeof params?.base === 'string' && typeof params.rate === 'number';
}

/** Demo plugin registering one model, `PERCENTAGE`: `input[base] * rate`. */
export function percentagePlugin(): PPEPlugin {
  const percentage: CalculationModel = {
    name: 'PERCENTAGE',
    version: '1.0.0',
    validateParams: (p) =>
      isPercentageParams(p)
        ? { valid: true }
        : { valid: false, errors: ['"base" must be a string', '"rate" must be a number'] },
    calculate: (input, _rule, p) => {
      const { base, rate } = p as PercentageParams;
      return Number(input[base]) * rate;
    },
  };
  return {
    name: 'percentage-demo',
    version: '1.0.0',
    onInit: (ctx) => ctx.modelRegistry.register(percentage),
  };
}

/** Adds the checksum `@run-iq/core` expects. */
export function sealRule<T extends object>(draft: T): T & { checksum: string } {
  return { ...draft, checksum: computeRuleChecksum(draft) };
}

/** Same as `sealRule`, typed as a core `Rule`. */
export function sealCoreRule(draft: Omit<Rule, 'checksum'>): Rule {
  return sealRule(draft);
}

export interface MemorySnapshotAdapter extends ISnapshotAdapter {
  readonly snapshots: Map<string, Snapshot>;
}

/** In-memory `ISnapshotAdapter`; snapshots are kept by id. */
export function memorySnapshotAdapter(): MemorySnapshotAdapter {
  const snapshots = new Map<string, Snapshot>();
  return {
    snapshots,
    async save(snapshot) {
      snapshots.set(snapshot.id, snapshot);
      return snapshot.id;
    },
    async get(snapshotId) {
      const snapshot = snapshots.get(snapshotId);
      if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);
      return snapshot;
    },
    async exists(requestId) {
      return [...snapshots.values()].some((s) => s.requestId === requestId);
    },
  };
}
