import { PPEEngine } from '@run-iq/core';
import { InMemoryRuleStore } from '@run-iq/context-engine';
import type { EvaluationResult } from '@run-iq/core';
import { CoreNodeExecutor, DGCompiler, DGOrchestrator, RuleStoreResolver } from '@run-iq/dg';
import type { DGGraph } from '@run-iq/dg';
import { percentagePlugin } from '../helpers.js';

const graph: DGGraph = {
  id: 'order-fees',
  version: '1.0.0',
  nodes: {
    shipping: {
      id: 'shipping',
      type: 'compute',
      model: 'PERCENTAGE',
      policy: { onError: 'fail', onFailPropagation: 'halt' },
      ports: {
        in: [{ name: 'orderTotal', required: true }],
        out: [{ name: 'value', required: true }],
      },
    },
  },
  edges: [],
};

describe('rule store -> decision graph -> core', () => {
  // rupture n°1 du document, corrigée en phase 1
  it.fails('une règle publiée dans le store est appliquée par le nœud compute', async () => {
    const store = new InMemoryRuleStore();
    const saved = await store.saveRule({
      id: 'shipping-fee',
      model: 'PERCENTAGE',
      tenantId: 'acme',
      scope: 'tenant-specific',
      effectiveFrom: '2025-01-01',
      payload: JSON.stringify({ params: { base: 'orderTotal', rate: 0.05 } }),
      createdBy: 'alice',
    });
    await store.updateRuleStatus('shipping-fee', saved.version, 'review', 'alice');
    await store.publishRule('shipping-fee', saved.version, 'bob');

    const engine = new PPEEngine({ plugins: [percentagePlugin()], dsls: [] });
    const skipped: string[] = [];
    const orchestrator = new DGOrchestrator(
      new CoreNodeExecutor(engine, new RuleStoreResolver(store)),
      new Map(),
      {
        hooks: {
          afterNode: async (_node, nodeResult) => {
            const raw = nodeResult.raw as EvaluationResult;
            skipped.push(...raw.skippedRules.map((s) => `${s.rule.id}:${s.reason}`));
          },
        },
      },
    );

    const result = await orchestrator.execute(
      new DGCompiler().compile(graph),
      { orderTotal: 200 },
      {
        requestId: 'order-42',
        tenantId: 'acme',
        timestamp: '2025-06-01T00:00:00.000Z',
        effectiveDate: '2025-06-01',
      },
    );

    expect(result.status).toBe('completed');
    expect(skipped).toEqual([]);
    expect(result.outputs['shipping.value']).toBe(10);
  });
});
