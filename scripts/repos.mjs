import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const SELF = resolve(HERE, '..');
export const ROOT = resolve(SELF, '..');

/** Build order (topological). web-platform is excluded on purpose (Task 4). */
export const ALL_REPOS = [
  'spec',
  'core',
  'context-engine',
  'dsl-jsonlogic',
  'plugin-sdk',
  'decision-graph',
  'rule-registry',
  'plugin-fiscal',
  'policy-dsl',
  'policy-graph',
  'policy-engine',
  'policy-bridge',
  'cli',
  'server',
  'mcp-server',
];

/** `spec` is optional: skipped while the folder does not exist. */
export const REPOS = ALL_REPOS.filter((name) => name !== 'spec' || existsSync(resolve(ROOT, name)));
