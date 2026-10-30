import { PPEEngine } from '@run-iq/core';
import type { EvaluationResult } from '@run-iq/core';
import { memorySnapshotAdapter, percentagePlugin, sealCoreRule } from '../helpers.js';

describe('requestId idempotence', () => {
  // rupture n°6 du document, corrigée en phase 2
  it.fails('un requestId déjà vu ne renvoie jamais un faux 0', async () => {
    const engine = new PPEEngine({
      plugins: [percentagePlugin()],
      dsls: [],
      snapshot: memorySnapshotAdapter(),
    });
    const rule = sealCoreRule({
      id: 'shipping-fee',
      version: 1,
      model: 'PERCENTAGE',
      params: { base: 'orderTotal', rate: 0.05 },
      priority: 1,
      effectiveFrom: new Date('2025-01-01'),
      effectiveUntil: null,
      tags: [],
    });
    const input = {
      requestId: 'order-42',
      data: { orderTotal: 200 },
      meta: { tenantId: 'acme', effectiveDate: new Date('2025-06-01') },
    };

    const first = await engine.evaluate([rule], input);
    expect(first.value).toBe(10);

    // Throwing on a replayed requestId is acceptable; a fabricated result is not.
    let second: EvaluationResult;
    try {
      second = await engine.evaluate([rule], input);
    } catch {
      return;
    }
    expect({ value: second.value, snapshotId: second.snapshotId }).not.toEqual({
      value: 0,
      snapshotId: 'cached',
    });
    expect(second.value).toBe(first.value);
  });
});
