import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { REPOS, ROOT, SELF } from './repos.mjs';

const missing = REPOS.filter((name) => !existsSync(resolve(ROOT, name, 'package.json')));
if (missing.length > 0) {
  console.error('Missing repositories next to integration-tests:');
  for (const name of missing)
    console.error(`  gh repo clone Run-IQ/${name} ${resolve(ROOT, name)}`);
  process.exit(1);
}

const workspace = {
  name: 'run-iq-workspace',
  private: true,
  workspaces: [...REPOS, 'integration-tests'],
};
writeFileSync(resolve(ROOT, 'package.json'), JSON.stringify(workspace, null, 2) + '\n');
copyFileSync(resolve(SELF, '.npmrc'), resolve(ROOT, '.npmrc'));
console.log(`Wrote ${resolve(ROOT, 'package.json')} (${REPOS.length + 1} workspaces)`);

const r = spawnSync('npm', ['install'], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
