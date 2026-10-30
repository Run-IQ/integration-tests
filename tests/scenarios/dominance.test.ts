import { PPEEngine } from '@run-iq/core';
import { percentagePlugin, sealCoreRule } from '../helpers.js';

function rule(id: string, priority: number, rate: number) {
  return sealCoreRule({
    id,
    version: 1,
    model: 'PERCENTAGE',
    params: { base: 'amount', rate },
    priority,
    effectiveFrom: new Date('2025-01-01'),
    effectiveUntil: null,
    tags: [],
    dominanceGroup: 'shipping',
  });
}

describe('dominanceGroup', () => {
  // rupture n°4 du document, corrigée en phase 2
  it.fails('seule la règle de plus haute priorité du groupe s’applique', async () => {
    const engine = new PPEEngine({ plugins: [percentagePlugin()], dsls: [] });
    const high = rule('shipping-high', 10, 1); // 100
    const low = rule('shipping-low', 5, 0.5); // 50

    const result = await engine.evaluate([high, low], {
      requestId: 'dominance-1',
      data: { amount: 100 },
      meta: { tenantId: 'acme', effectiveDate: new Date('2025-06-01') },
    });

    expect(result.value).toBe(100);
    expect(result.skippedRules.map((s) => s.rule.id)).toContain('shipping-low');
  });
});
