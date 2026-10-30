import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { REPOS, ROOT } from './repos.mjs';

const script = process.argv[2];
if (script !== 'build' && script !== 'test') {
  console.error('usage: run-all.mjs <build|test>');
  process.exit(2);
}
const stopOnFail = script === 'build';
const results = [];

for (const name of REPOS) {
  const dir = resolve(ROOT, name);
  const pkgPath = resolve(dir, 'package.json');
  const scripts = existsSync(pkgPath)
    ? (JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {})
    : {};
  if (!scripts[script]) {
    results.push({ name, status: 'skip' });
    continue;
  }
  console.log(`\n=== ${name}: npm run ${script} ===`);
  const r = spawnSync('npm', ['run', script], { cwd: dir, stdio: 'inherit' });
  const status = r.status === 0 ? 'ok' : 'FAIL';
  results.push({ name, status });
  if (status === 'FAIL' && stopOnFail) break;
}

console.log(`\n=== ${script} summary ===`);
for (const { name, status } of results) console.log(`${status.padEnd(5)} ${name}`);
const failed = results.filter((r) => r.status === 'FAIL');
if (failed.length > 0) {
  console.error(`\n${failed.length} failed: ${failed.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
