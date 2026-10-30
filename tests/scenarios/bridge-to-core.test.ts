import { PPEEngine } from '@run-iq/core';
import type { EvaluationResult } from '@run-iq/core';
import { InMemoryRuleStore } from '@run-iq/context-engine';
import { CoreNodeExecutor, DGCompiler, DGOrchestrator, RuleStoreResolver } from '@run-iq/dg';
import { JsonLogicEvaluator } from '@run-iq/dsl-jsonlogic';
import { PolicyBridge } from '@run-iq/policy-bridge';
import type { PolicyBridgeModel, PolicyGraph } from '@run-iq/policy-dsl';
import { percentagePlugin, sealCoreRule } from '../helpers.js';

const DUE_DATE = Date.parse('2025-03-01T00:00:00.000Z');
const PAID_AT = Date.parse('2025-03-15T00:00:00.000Z');
const data = { order_total: 200, paid_at: PAID_AT };
const EXPECTED_FEE = 20; // 10 % of 200, the payment is late

// Integrated-mode PolicyGraph: one rule, late payment fee when paid_at is AFTER the due date.
const policy: PolicyGraph = {
  meta: {
    id: 'late-payment',
    version: '1',
    dslVersion: '1.0.0',
    title: 'Late payment',
    domain: 'billing',
    language: 'en',
    mode: 'integrated',
    source: { filename: 'late-payment.txt', type: 'text', hash: '', ingestedAt: '2025-01-01' },
    confidence: 0.95,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
  },
  nodes: [
    {
      id: 'late_payment',
      type: 'Rule',
      label: 'A 10% fee applies when the payment arrives after the due date',
      condition: {
        type: 'AFTER',
        value: { type: 'VAR', path: 'paid_at' },
        date: { type: 'CONST', value: DUE_DATE },
      },
      action: { type: 'COMPUTE', output: 'late_fee', value: { type: 'VAR', path: 'order_total' } },
      model: 'PERCENTAGE',
      params: { base: 'order_total', rate: 0.1 },
      sourceRef: 'segment_0',
      confidence: 0.95,
      extractedBy: 'manual',
    },
  ],
  edges: [],
  variables: [],
  chunks: [],
  index: {
    byType: { Rule: ['late_payment'], Exception: [], Definition: [], Reference: [], Threshold: [] },
    bySource: { segment_0: ['late_payment'] },
    conflicts: [],
    gaps: [],
  },
} as unknown as PolicyGraph;

const percentage: PolicyBridgeModel = {
  name: 'PERCENTAGE',
  validateParams: (p) => ({ valid: typeof (p as { rate?: unknown } | null)?.rate === 'number' }),
};
const models = new Map([[percentage.name, percentage]]);
const registry = { get: (name: string) => models.get(name) ?? null, getAll: () => models };

function compilePolicy() {
  return new PolicyBridge(registry).compile(policy, {
    tenantId: 'acme',
    effectiveFrom: '2025-01-01',
  });
}

function newEngine() {
  return new PPEEngine({ plugins: [percentagePlugin()], dsls: [new JsonLogicEvaluator()] });
}

describe('policy-bridge -> rule store -> decision graph -> core', () => {
  it('le bridge compile la politique', () => {
    const { rules, dgGraph, report } = compilePolicy();
    expect(report.readyForRegistry).toBe(true);
    expect(rules).toHaveLength(1);
    expect(Object.keys(dgGraph.nodes)).toEqual(['late_payment']);
  });

  // rupture n°12 du document, corrigée en phase 6
  it.fails('la condition AFTER générée est évaluée par dsl-jsonlogic', async () => {
    const [ruleInput] = compilePolicy().rules;
    const payload = JSON.parse(ruleInput!.payload) as {
      params: unknown;
      condition: { dsl: string; value: unknown };
    };
    const rule = sealCoreRule({
      id: 'late_payment',
      version: 1,
      model: 'PERCENTAGE',
      params: payload.params,
      condition: payload.condition,
      priority: 1,
      effectiveFrom: new Date('2025-01-01'),
      effectiveUntil: null,
      tags: [],
    });

    const result = await newEngine().evaluate([rule], {
      requestId: 'bridge-rule',
      data,
      meta: { tenantId: 'acme', effectiveDate: new Date('2025-06-01') },
    });

    expect(result.skippedRules.map((s) => `${s.rule.id}:${s.reason}`)).toEqual([]);
    expect(result.value).toBe(EXPECTED_FEE);
  });

  // ruptures n°9 et n°12 du document, corrigées en phases 4 et 6
  // Also depends on rupture n°1 (store checksum, phase 1). Today the first failure is the
  // generated node's single required input port `input`, which the business input cannot fill.
  it.fails(
    'le graphe généré, exécuté sur les règles du store, produit le montant attendu',
    async () => {
      const { rules, dgGraph } = compilePolicy();

      const store = new InMemoryRuleStore();
      for (const input of rules) {
        const saved = await store.saveRule(input);
        await store.updateRuleStatus(saved.id, saved.version, 'review', 'alice');
        await store.publishRule(saved.id, saved.version, 'bob');
      }

      const engineResults: EvaluationResult[] = [];
      const nodeErrors: string[] = [];
      const orchestrator = new DGOrchestrator(
        new CoreNodeExecutor(newEngine(), new RuleStoreResolver(store)),
        new Map(),
        {
          hooks: {
            afterNode: async (_node, nodeResult) => {
              engineResults.push(nodeResult.raw as EvaluationResult);
            },
            // The generated nodes use onError 'fallback', which hides the cause: record it.
            onError: async (node, error) => {
              nodeErrors.push(`${node.id}: ${error.message}`);
            },
          },
        },
      );

      const result = await orchestrator.execute(new DGCompiler().compile(dgGraph), data, {
        requestId: 'bridge-graph',
        tenantId: 'acme',
        timestamp: '2025-06-01T00:00:00.000Z',
        effectiveDate: '2025-06-01',
      });

      expect(result.failed).toEqual([]);
      expect(nodeErrors).toEqual([]);
      expect(result.outputs['late_payment.late_fee']).not.toBeNull();
      expect(result.outputs['late_payment.late_fee']).toBe(EXPECTED_FEE);
    },
  );
});
