import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PPEEngine } from '@run-iq/core';
import { JsonLogicEvaluator } from '@run-iq/dsl-jsonlogic';
import { FiscalPlugin } from '@run-iq/plugin-fiscal';

interface Example {
  rules: string;
  input: string;
}

// Workspace root = parent of this repo, as in scripts/repos.mjs.
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

// web-platform is not part of the workspace: only its source file is read.
const examplesUrl = pathToFileURL(resolve(ROOT, 'web-platform/src/lib/examples.ts')).href;
const { examples } = (await import(/* @vite-ignore */ examplesUrl)) as {
  examples: Record<string, Example>;
};

function example(key: string): Example {
  const found = examples[key];
  if (!found) throw new Error(`playground example "${key}" not found`);
  return found;
}

describe('web-platform playground examples with plugin-fiscal', () => {
  const engine = new PPEEngine({
    plugins: [new FiscalPlugin()],
    dsls: [new JsonLogicEvaluator()],
    onChecksumMismatch: 'skip',
    strict: false,
    dryRun: true,
  });

  function run(key: string) {
    const { rules, input } = example(key);
    return engine.evaluate(JSON.parse(rules), JSON.parse(input));
  }

  it('handles regular playground examples', async () => {
    expect((await run('irpp')).value).toBe(180000);
    expect((await run('vat')).value).toBe(900000);
  });

  it('handles Full Payroll (additive behavior across categories)', async () => {
    const result = await run('fullPayroll');
    expect(result.appliedRules).toHaveLength(6);
    expect(result.value).toBe(5236200);
  });

  it('handles meta-rules correctly (inhibition and short-circuit)', async () => {
    const zf = await run('zonefranche');
    expect(zf.value).toBe(810000);
    expect(zf.skippedRules.some((s) => s.reason === 'INHIBITED_BY_META_RULE')).toBe(true);

    const ngo = await run('ngoExempt');
    expect(ngo.value).toBe(0);
    expect(ngo.appliedRules.some((r) => r.model === 'META_SHORT_CIRCUIT')).toBe(true);
  });
});
