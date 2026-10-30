# integration-tests

Builds and tests the Run-IQ repositories together, the way they are used together. Each repo is a sibling folder of this one; the scripts link them into a single npm workspace so `@run-iq/*` imports resolve to the local sources, with a single copy of `@run-iq/core`.

## Setup

Clone every repo of `scripts/repos.mjs` next to this one (`gh repo clone Run-IQ/<name>`), then:

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # GitHub Packages read access
npm run bootstrap   # writes ../package.json and ../.npmrc (workspace), runs npm install at the root
npm run build:all   # npm run build in each repo, in dependency order, stops at first failure
npm run test:all    # npm test in each repo, reports every failure at the end
npm test            # cross-repo scenarios (this repo)
```

`bootstrap` fails with the `gh repo clone` command for any missing repo. `spec` is built first once its folder exists; it is skipped until then. `web-platform` is not part of the workspace.

Generated files `../package.json`, `../package-lock.json`, `../node_modules` live outside any repo. Installing can set the executable bit on `cli/bin/run-iq.js`; revert with `git -C ../cli checkout -- bin/run-iq.js`. npm prints a warning that it ignores the workspace config of this `.npmrc`; the root `.npmrc` copy is the one used.

## Notes

- Packages do not export `./package.json`, so `tests/workspace.test.ts` resolves each package's entry point (requires `build:all` first).
- `mcp-server/vitest.config.ts` aliases `../core/src`, so its tests run against core sources, not `dist`.
- No version range had to be widened: every sibling range accepts the local version.

## Starting state (`npm run test:all`, 2026-10-30)

| Repo | State |
| --- | --- |
| core, context-engine, dsl-jsonlogic, plugin-sdk, decision-graph, rule-registry, plugin-fiscal, policy-dsl, policy-graph, policy-engine, policy-bridge, mcp-server | green |
| cli | red, 2 tests in `tests/commands/validate.test.ts` (invalid rules are reported valid against local core 0.2.8; the repo's lockfile pins published core 0.2.7) |
| server | red, 2 tests in `tests/standalone.test.ts` (expect `plugin-fiscal`/`dsl-jsonlogic` to be absent; they are installed in the workspace) |

## License

MIT
