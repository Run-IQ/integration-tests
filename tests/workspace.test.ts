import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
const require = createRequire(import.meta.url);
it.each([
  '@run-iq/core',
  '@run-iq/context-engine',
  '@run-iq/dg',
  '@run-iq/rule-registry',
  '@run-iq/policy-bridge',
])('%s résout vers le dossier local', (name) => {
  // Les paquets n'exportent pas ./package.json : on résout le point d'entrée (dist/ construit).
  const resolved = realpathSync(require.resolve(name));
  expect(resolved).not.toContain('node_modules/@run-iq');
});
it('une seule copie de @run-iq/core est chargée', async () => {
  expect(realpathSync(require.resolve('@run-iq/core'))).toBe(
    realpathSync(createRequire(require.resolve('@run-iq/dg')).resolve('@run-iq/core')),
  );
});
