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

`bootstrap` fails with the `gh repo clone` command for any missing repo. `spec` is built first once its folder exists; it is skipped until then. `web-platform` is not part of the workspace (a Next.js app); `tests/playground-examples.test.ts` only reads its `src/lib/examples.ts`, so the folder must exist next to this one (`gh repo clone Run-IQ/web-platform`; no install needed).

Generated files `../package.json`, `../package-lock.json`, `../node_modules` live outside any repo. Installing can set the executable bit on `cli/bin/run-iq.js`; revert with `git -C ../cli checkout -- bin/run-iq.js`. npm prints a warning that it ignores the workspace config of this `.npmrc`; the root `.npmrc` copy is the one used.

## Notes

- Packages do not export `./package.json`, so `tests/workspace.test.ts` resolves each package's entry point (requires `build:all` first).
- `mcp-server/vitest.config.ts` aliases `../core/src`, so its tests run against core sources, not `dist`.
- No version range had to be widened: every sibling range accepts the local version.

## Starting state (`npm run test:all`, 2026-10-30)

| Repo | State |
| --- | --- |
| core, context-engine, dsl-jsonlogic, plugin-sdk, decision-graph, rule-registry, plugin-fiscal, policy-dsl, policy-graph, policy-engine, policy-bridge, mcp-server | green |
| cli | was red, 2 tests in `tests/commands/validate.test.ts` (core 0.2.8 `hydrateRules` throws on wrong-typed fields, core 0.2.7 did not); tests fixed, now green |
| server | was red, 2 tests in `tests/standalone.test.ts` (expected `plugin-fiscal`/`dsl-jsonlogic` to be absent; they are installed in the workspace); tests now simulate the missing package, now green |

## Deprecating the npm public versions

Releases go to GitHub Packages only. Old versions of these packages exist on the public npm registry (`decision-graph`, `context-engine`, `rule-registry`, `policy-engine`, `policy-dsl` and `policy-graph` were never published there). Deprecation needs the npm account that owns the `@run-iq` scope, so run these yourself after `npm login`; they are not run by any script:

```bash
npm deprecate @run-iq/core@"*" "Moved to GitHub Packages: https://github.com/orgs/Run-IQ/packages" --registry https://registry.npmjs.org
npm deprecate @run-iq/plugin-sdk@"*" "Moved to GitHub Packages: https://github.com/orgs/Run-IQ/packages" --registry https://registry.npmjs.org
npm deprecate @run-iq/dsl-jsonlogic@"*" "Moved to GitHub Packages: https://github.com/orgs/Run-IQ/packages" --registry https://registry.npmjs.org
npm deprecate @run-iq/plugin-fiscal@"*" "Moved to GitHub Packages: https://github.com/orgs/Run-IQ/packages" --registry https://registry.npmjs.org
npm deprecate @run-iq/mcp-server@"*" "Moved to GitHub Packages: https://github.com/orgs/Run-IQ/packages" --registry https://registry.npmjs.org
npm deprecate @run-iq/cli@"*" "Moved to GitHub Packages: https://github.com/orgs/Run-IQ/packages" --registry https://registry.npmjs.org
npm deprecate @run-iq/server@"*" "Moved to GitHub Packages: https://github.com/orgs/Run-IQ/packages" --registry https://registry.npmjs.org
npm deprecate @run-iq/policy-bridge@"*" "Moved to GitHub Packages: https://github.com/orgs/Run-IQ/packages" --registry https://registry.npmjs.org
```

## CI

`.github/workflows/integration.yml` runs on push, pull request and nightly: it clones the repos of `scripts/repos.mjs` and `web-platform` (source only, not in the workspace) next to this one, then runs `bootstrap`, `build:all`, `test:all` and `test`. It needs a secret `RUN_IQ_REPOS_TOKEN` (a personal access token with `repo` and `read:packages`), because `plugin-fiscal` is private.

## License

MIT
