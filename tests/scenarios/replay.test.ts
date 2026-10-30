import { PPEEngine } from '@run-iq/core';
import type { EvaluationInput, Rule } from '@run-iq/core';
import { JsonLogicEvaluator } from '@run-iq/dsl-jsonlogic';
import { FiscalPlugin } from '@run-iq/plugin-fiscal';
import { memorySnapshotAdapter, sealRule } from '../helpers.js';

describe('snapshot replay', () => {
  // rupture n°5 du document, corrigée en phase 2
  it.fails('rejouer snapshot.rulesSnapshot redonne la même valeur', async () => {
    const snapshots = memorySnapshotAdapter();
    const engine = new PPEEngine({
      plugins: [new FiscalPlugin()],
      dsls: [new JsonLogicEvaluator()],
      snapshot: snapshots,
    });

    const vat = sealRule({
      id: 'vat',
      version: 1,
      model: 'FLAT_RATE',
      params: { base: 'sales', rate: 0.18 },
      effectiveFrom: new Date('2025-01-01'),
      effectiveUntil: null,
      tags: [],
      jurisdiction: 'NATIONAL',
      scope: 'GLOBAL',
      country: 'TG',
      category: 'vat',
    }) as unknown as Rule;

    const input = (requestId: string): EvaluationInput => ({
      requestId,
      data: { sales: 1000 },
      meta: { tenantId: 'acme', effectiveDate: new Date('2025-06-01'), context: { country: 'TG' } },
    });

    const first = await engine.evaluate([vat], input('replay-1'));
    expect(first.value).toBe(180);

    const snapshot = await snapshots.get(first.snapshotId);
    const replayed = await engine.evaluate(snapshot.rulesSnapshot, input('replay-2'));

    expect(replayed.skippedRules.map((s) => `${s.rule.id}:${s.reason}`)).toEqual([]);
    expect(replayed.value).toBe(first.value);
  });
});
