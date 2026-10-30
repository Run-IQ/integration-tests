// Runs each repo's ci.yml steps locally, on a clean copy of its committed HEAD,
// outside the workspace (same conditions as a lone checkout on GitHub Actions).
// Usage: node scripts/ci-local.mjs [repo ...]   (needs `gh auth login` for GitHub Packages)
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REPOS, ROOT } from './repos.mjs';

const STEPS = ['ci', 'run typecheck', 'run lint', 'test', 'run build'];
const names = process.argv.length > 2 ? process.argv.slice(2) : REPOS;

const work = mkdtempSync(join(tmpdir(), 'run-iq-ci-'));
const userconfig = join(work, '.npmrc');
// The token stays in the environment; the file only references it.
writeFileSync(
  userconfig,
  '@run-iq:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n',
);
const env = {
  ...process.env,
  NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || execSync('gh auth token').toString().trim(),
  NPM_CONFIG_USERCONFIG: userconfig,
};

const results = [];
for (const name of names) {
  const dir = join(work, name);
  execSync(`mkdir -p ${dir} && git -C ${resolve(ROOT, name)} archive HEAD | tar -x -C ${dir}`);
  let status = 'ok';
  for (const step of STEPS) {
    console.log(`\n=== ${name}: npm ${step} ===`);
    const r = spawnSync('npm', step.split(' '), { cwd: dir, env, stdio: 'inherit' });
    if (r.status !== 0) {
      status = `FAIL (${step})`;
      break;
    }
  }
  results.push({ name, status });
}
rmSync(work, { recursive: true, force: true });

console.log('\n=== ci:local summary ===');
for (const { name, status } of results) console.log(`${status.padEnd(18)} ${name}`);
if (results.some((r) => r.status !== 'ok')) process.exit(1);
