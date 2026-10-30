import { PPEEngine } from '@run-iq/core';
import { CoreNodeExecutor, DGCompiler, DGOrchestrator, StaticRuleResolver } from '@run-iq/dg';
import type { CompiledGraph, DGGraph } from '@run-iq/dg';
import { percentagePlugin, sealCoreRule } from '../helpers.js';

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

const shippingRule = sealCoreRule({
  id: 'shipping-fee',
  version: 1,
  model: 'PERCENTAGE',
  params: { base: 'orderTotal', rate: 0.05 },
  priority: 1,
  effectiveFrom: new Date('2025-01-01'),
  effectiveUntil: null,
  tags: [],
});

function run(compiled: CompiledGraph, requestId: string) {
  // Rules are passed directly so that only the compiled graph is under test.
  const engine = new PPEEngine({ plugins: [percentagePlugin()], dsls: [] });
  const orchestrator = new DGOrchestrator(
    new CoreNodeExecutor(engine, new StaticRuleResolver(new Map([['shipping', [shippingRule]]]))),
    new Map(),
  );
  return orchestrator.execute(
    compiled,
    { orderTotal: 200 },
    {
      requestId,
      tenantId: 'acme',
      timestamp: '2025-06-01T00:00:00.000Z',
      effectiveDate: '2025-06-01',
    },
  );
}

describe('compiled graph persisted as JSON', () => {
  it('le graphe compilé original donne 10', async () => {
    const result = await run(new DGCompiler().compile(graph), 'original');
    expect(result.outputs['shipping.value']).toBe(10);
  });

  // rupture n°2 du document, corrigée en phase 4
  it.fails('le graphe compilé relu depuis JSON donne le même résultat', async () => {
    const compiled = new DGCompiler().compile(graph);
    const restored = JSON.parse(JSON.stringify(compiled)) as CompiledGraph;

    const original = await run(compiled, 'original');
    const replayed = await run(restored, 'restored');

    expect(replayed.status).toBe(original.status);
    expect(replayed.outputs).toEqual(original.outputs);
  });
});
